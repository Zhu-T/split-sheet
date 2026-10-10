"use server";

import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authz";
import { CURRENCY_CODES } from "@/lib/currencies";
import { cleanDisplayName, safeRedirectPath } from "@/lib/rules";
import { setUserName } from "@/lib/users";
import { parseVenmoUsername } from "@/lib/venmo";

export async function signInWithDiscord(form: FormData) {
  // Every sign-in passes through /welcome, which asks new users for their name and
  // immediately forwards everyone else to where they were going.
  const next = safeRedirectPath(form.get("next")?.toString());
  await signIn("discord", { redirectTo: `/welcome?next=${encodeURIComponent(next)}` });
}

export type NameFormState = { error?: string; saved?: boolean };

/** First sign-in: confirm or change the name (pre-filled from Discord), then continue. */
export async function completeWelcome(next: string, _: NameFormState, form: FormData): Promise<NameFormState> {
  const user = await requireUser();
  const name = cleanDisplayName(form.get("name"));
  if (!name) return { error: "Enter a name between 1 and 60 characters" };
  await setUserName(user.id, name);
  redirect(safeRedirectPath(next));
}

/** Settings: change your own name. It updates everywhere you appear, in every group. */
export async function updateMyName(_: NameFormState, form: FormData): Promise<NameFormState> {
  const user = await requireUser();
  const name = cleanDisplayName(form.get("name"));
  if (!name) return { error: "Enter a name between 1 and 60 characters" };
  await setUserName(user.id, name);
  refresh();
  return { saved: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function setHomeCurrency(form: FormData) {
  const user = await requireUser();
  const parsed = z.enum(CURRENCY_CODES as [string, ...string[]]).safeParse(form.get("homeCurrency"));
  if (!parsed.success) return;
  await db.update(schema.users).set({ homeCurrency: parsed.data }).where(eq(schema.users.id, user.id));
  refresh();
}

export type VenmoFormState = { error?: string; saved?: boolean };

export async function setVenmoUsername(_: VenmoFormState, form: FormData): Promise<VenmoFormState> {
  const user = await requireUser();
  const raw = String(form.get("venmoUsername") ?? "");
  const venmoUsername = raw.trim() === "" ? null : parseVenmoUsername(raw);
  if (raw.trim() !== "" && !venmoUsername) {
    return { error: "Venmo usernames are 5–30 letters, numbers, hyphens or underscores" };
  }
  await db.update(schema.users).set({ venmoUsername }).where(eq(schema.users.id, user.id));
  refresh();
  return { saved: true };
}

/**
 * Delete the user row. Their member rows become placeholders (user_id is set null by the
 * foreign key) so group balances stay correct; their email is removed from those rows too.
 */
export async function deleteAccount() {
  const user = await requireUser();
  await db.transaction(async (tx) => {
    // Hand ownership of each group this user owns to the longest-standing signed-in member.
    const owned = await tx
      .select({ groupId: schema.members.groupId })
      .from(schema.members)
      .where(and(eq(schema.members.userId, user.id), eq(schema.members.role, "owner")));
    for (const { groupId } of owned) {
      const [heir] = await tx
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(
          and(
            eq(schema.members.groupId, groupId),
            eq(schema.members.active, true),
            isNotNull(schema.members.userId),
            ne(schema.members.userId, user.id),
          ),
        )
        .orderBy(asc(schema.members.joinedAt))
        .limit(1);
      if (heir) await tx.update(schema.members).set({ role: "owner" }).where(eq(schema.members.id, heir.id));
    }
    await tx
      .update(schema.members)
      .set({ email: null, role: "member" })
      .where(eq(schema.members.userId, user.id));
    await tx.delete(schema.users).where(eq(schema.users.id, user.id));
  });
  await signOut({ redirectTo: "/login?deleted=1" });
}
