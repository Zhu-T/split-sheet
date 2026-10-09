"use server";

import { randomBytes } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireMember, requireUser } from "@/lib/authz";
import { CURRENCY_CODES } from "@/lib/currencies";
import { findClaimablePlaceholder, LIMITS } from "@/lib/rules";
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
  // A claimed member's email belongs to their Google account; only placeholders can change it.
  const values = target.userId ? { displayName: parsed.data.displayName } : parsed.data;
  await db.update(schema.members).set(values).where(eq(schema.members.id, memberId));
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
      .set({ userId: user.id, joinedAt: new Date() })
      .where(and(eq(schema.members.id, placeholder.id), isNull(schema.members.userId)));
  } else {
    if (groupMembers.length >= LIMITS.membersPerGroup) return { error: "This group is full" };
    await db
      .insert(schema.members)
      .values({ groupId: group.id, userId: user.id, displayName: user.name, email: user.email });
  }
  redirect(`/groups/${group.id}`);
}
