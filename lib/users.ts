import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type DiscordIdentity = { discordId: string; email: string; name: string };

/**
 * Whether this Discord account may sign in. Refused only when its (verified) email already
 * belongs to a different Discord account, so one account can't take over another's data.
 */
export async function canSignIn({ discordId, email }: Pick<DiscordIdentity, "discordId" | "email">) {
  const [byEmail] = await db
    .select({ discordId: schema.users.discordId })
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email)));
  return !byEmail || byEmail.discordId === null || byEmail.discordId === discordId;
}

/**
 * Find or create the user for a Discord sign-in. Users are keyed by Discord ID; an existing
 * row with the same verified email but no Discord ID yet (e.g. created before Discord login)
 * is linked rather than duplicated. Stores only Discord ID, email and display name.
 */
export async function upsertDiscordUser({ discordId, email, name }: DiscordIdentity) {
  const e = normalizeEmail(email);
  const n = name.slice(0, 80);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.discordId, discordId));
    if (existing) {
      // Follow email changes on Discord unless another account already uses that address.
      const [taken] = existing.email === e ? [] : await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, e));
      await tx
        .update(schema.users)
        .set(taken ? { name: n } : { name: n, email: e })
        .where(eq(schema.users.id, existing.id));
      return { id: existing.id };
    }
    const [byEmail] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, e));
    if (byEmail) {
      await tx.update(schema.users).set({ discordId, name: n }).where(eq(schema.users.id, byEmail.id));
      return { id: byEmail.id };
    }
    const [created] = await tx.insert(schema.users).values({ discordId, email: e, name: n }).returning({ id: schema.users.id });
    return created;
  });
}
