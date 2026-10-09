import "server-only";
import { db, schema } from "@/db";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Create or refresh the user row on sign-in. Only email and display name are stored. */
export async function upsertUser(email: string, name: string) {
  const [user] = await db
    .insert(schema.users)
    .values({ email: normalizeEmail(email), name: name.slice(0, 80) })
    .onConflictDoUpdate({ target: schema.users.email, set: { name: name.slice(0, 80) } })
    .returning({ id: schema.users.id });
  return user;
}
