"use server";

import { randomBytes } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireMember, requireUser } from "@/lib/authz";
import { CURRENCY_CODES } from "@/lib/currencies";
import { findClaimablePlaceholder, LIMITS } from "@/lib/rules";
import { parseWebhookUrl } from "@/lib/discord";
import { postGroupDigest } from "@/lib/notify";
import { normalizeEmail } from "@/lib/users";

export type ActionResult = { error?: string };

const newInviteToken = () => randomBytes(32).toString("base64url");
const name = z.string().trim().min(1, "Name is required").max(LIMITS.nameLength);
const currency = z.enum(CURRENCY_CODES as [string, ...string[]]);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => (v ? normalizeEmail(v) : null))
  .pipe(z.email("Enter a valid email").nullable());

async function requireOwner(groupId: string) {
  const ctx = await requireMember(groupId);
  if (ctx.member.role !== "owner") notFound();
  return ctx;
}

export async function createGroup(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ name, baseCurrency: currency }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.members)
    .where(and(eq(schema.members.userId, user.id), eq(schema.members.active, true)));
  if (n >= LIMITS.groupsPerUser) return { error: `You can be in at most ${LIMITS.groupsPerUser} groups` };

  const groupId = await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(schema.groups)
      .values({ ...parsed.data, inviteToken: newInviteToken(), createdBy: user.id })
      .returning({ id: schema.groups.id });
    await tx.insert(schema.members).values({
      groupId: group.id,
      userId: user.id,
      displayName: user.name,
      email: user.email,
      role: "owner",
    });
    return group.id;
  });
  redirect(`/groups/${groupId}?created=1`);
}

export async function updateGroup(groupId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember(groupId);
  const parsed = z.object({ name, baseCurrency: currency }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(schema.groups).where(eq(schema.groups.id, groupId)).for("update");
    if (group.baseCurrency !== parsed.data.baseCurrency) {
      // Stored exchange rates are relative to the base currency, so it is fixed once used.
      const [{ n }] = await tx
        .select({ n: count() })
        .from(schema.expenses)
        .where(and(eq(schema.expenses.groupId, groupId), isNull(schema.expenses.deletedAt)));
      if (n > 0) return { error: "The base currency can't change once the group has expenses" };
    }
    await tx.update(schema.groups).set(parsed.data).where(eq(schema.groups.id, groupId));
    refresh();
    return {};
  });
}

export async function rotateInvite(groupId: string): Promise<void> {
  await requireOwner(groupId);
  await db.update(schema.groups).set({ inviteToken: newInviteToken() }).where(eq(schema.groups.id, groupId));
  refresh();
}

export async function addMember(groupId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember(groupId);
  const parsed = z
    .object({ displayName: name, email: optionalEmail })
    .safeParse({ displayName: form.get("displayName"), email: form.get("email") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db
    .select({ email: schema.members.email })
    .from(schema.members)
    .where(eq(schema.members.groupId, groupId));
  if (existing.length >= LIMITS.membersPerGroup) return { error: `Groups are limited to ${LIMITS.membersPerGroup} members` };
  if (parsed.data.email && existing.some((m) => m.email === parsed.data.email)) {
    return { error: "Someone in this group already has that email" };
  }
  await db.insert(schema.members).values({ groupId, ...parsed.data });
  refresh();
  return {};
}

export async function updateMember(
  groupId: string,
  memberId: string,
  _: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  await requireMember(groupId);
  const parsed = z
    .object({ displayName: name, email: optionalEmail })
    .safeParse({ displayName: form.get("displayName"), email: form.get("email") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [target] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, memberId), eq(schema.members.groupId, groupId)));
  if (!target) notFound();
  // People who've joined choose their own name (on sign-in and in Settings); only
  // placeholders, i.e. people added by name who haven't joined yet, can be edited here.
  if (target.userId) return { error: "People who've joined set their own name in Settings" };
  await db.update(schema.members).set(parsed.data).where(eq(schema.members.id, memberId));
  refresh();
  return {};
}

export async function setMemberActive(groupId: string, memberId: string, active: boolean): Promise<void> {
  const { member } = await requireOwner(groupId);
  if (member.id === memberId) return; // owners can't remove themselves
  await db
    .update(schema.members)
    .set({ active })
    .where(and(eq(schema.members.id, memberId), eq(schema.members.groupId, groupId)));
  refresh();
}

/** Join through an invite link, claiming a matching placeholder if there is one. */
export async function joinGroup(token: string): Promise<ActionResult> {
  const user = await requireUser();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.inviteToken, token));
  if (!group) return { error: "This invite link is no longer valid" };

  const groupMembers = await db.select().from(schema.members).where(eq(schema.members.groupId, group.id));
  const mine = groupMembers.find((m) => m.userId === user.id);
  if (mine?.active) redirect(`/groups/${group.id}`);
  if (mine) return { error: "You were removed from this group. Ask the owner to add you back." };

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.members)
    .where(and(eq(schema.members.userId, user.id), eq(schema.members.active, true)));
  if (n >= LIMITS.groupsPerUser) return { error: `You can be in at most ${LIMITS.groupsPerUser} groups` };

  // Deactivated placeholders stay removed; the invite can't bring them back.
  const placeholder = findClaimablePlaceholder(groupMembers.filter((m) => m.active), user.email);
  if (placeholder) {
    await db
      .update(schema.members)
      .set({ userId: user.id, displayName: user.name, joinedAt: new Date() })
      .where(and(eq(schema.members.id, placeholder.id), isNull(schema.members.userId)));
  } else {
    if (groupMembers.length >= LIMITS.membersPerGroup) return { error: "This group is full" };
    await db
      .insert(schema.members)
      .values({ groupId: group.id, userId: user.id, displayName: user.name, email: user.email });
  }
  redirect(`/groups/${group.id}`);
}

export type WebhookFormState = { error?: string; connected?: boolean };

/** Connect a Discord channel webhook (owner only). Checks with Discord that it exists first. */
export async function setDiscordWebhook(groupId: string, _: WebhookFormState, form: FormData): Promise<WebhookFormState> {
  await requireOwner(groupId);
  const url = parseWebhookUrl(String(form.get("webhookUrl") ?? ""));
  if (!url) return { error: "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)" };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { error: "Discord didn't recognise that webhook. Copy it again from the channel's Integrations settings." };
  } catch {
    return { error: "Couldn't reach Discord. Try again in a moment." };
  }

  // No welcome message: the channel gets at most one post a day, and that's the summary.
  await db.update(schema.groups).set({ discordWebhookUrl: url }).where(eq(schema.groups.id, groupId));
  refresh();
  return { connected: true };
}

export async function removeDiscordWebhook(groupId: string): Promise<void> {
  await requireOwner(groupId);
  await db.update(schema.groups).set({ discordWebhookUrl: null }).where(eq(schema.groups.id, groupId));
  refresh();
}

export async function setDiscordAutoDigest(groupId: string, enabled: boolean): Promise<void> {
  await requireOwner(groupId);
  await db.update(schema.groups).set({ discordAutoDigest: enabled }).where(eq(schema.groups.id, groupId));
  refresh();
}

/** Post today's summary now instead of waiting for the automatic one (still once a day). */
export async function postDiscordSummaryNow(groupId: string): Promise<ActionResult & { nextAt?: string }> {
  await requireOwner(groupId);
  const r = await postGroupDigest(groupId, { skipIfQuiet: false });
  refresh();
  if (r.posted) return {};
  switch (r.reason) {
    case "too-soon":
      return { error: "Today's summary has already been posted.", nextAt: r.nextAt.toISOString() };
    case "not-connected":
      return { error: "No Discord channel is connected" };
    default:
      return { error: r.status === 404 ? "The webhook was deleted in Discord. Disconnect and add a new one." : "Discord didn't accept the message. Try again later." };
  }
}

/**
 * Permanently delete a group and everything in it (owner only). The owner must type the
 * group's name to confirm; the check is repeated here, not just in the browser.
 */
export async function deleteGroup(groupId: string, confirmName: string): Promise<ActionResult> {
  const { group } = await requireOwner(groupId);
  if (String(confirmName ?? "").trim() !== group.name.trim()) {
    return { error: "Type the group's name exactly to confirm" };
  }
  await db.transaction(async (tx) => {
    const expenseIds = tx.select({ id: schema.expenses.id }).from(schema.expenses).where(eq(schema.expenses.groupId, groupId));
    await tx.delete(schema.expenseSplits).where(inArray(schema.expenseSplits.expenseId, expenseIds));
    await tx.delete(schema.expenses).where(eq(schema.expenses.groupId, groupId));
    await tx.delete(schema.members).where(eq(schema.members.groupId, groupId));
    await tx.delete(schema.groups).where(eq(schema.groups.id, groupId));
  });
  redirect("/");
}
