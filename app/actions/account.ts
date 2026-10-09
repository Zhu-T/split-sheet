"use server";

import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/authz";
import { CURRENCY_CODES } from "@/lib/currencies";
import { safeRedirectPath } from "@/lib/rules";

export async function signInWithGoogle(form: FormData) {
  await signIn("google", { redirectTo: safeRedirectPath(form.get("next")?.toString()) });
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
