import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { hasAccess } from "./rules";

export type CurrentUser = { id: string; email: string; name: string; homeCurrency: string; venmoUsername: string | null };

/** The signed-in user, loaded fresh from the database (so deleted accounts are rejected). */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      homeCurrency: schema.users.homeCurrency,
      venmoUsername: schema.users.venmoUsername,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!user) redirect("/login");
  return user;
});

/**
 * The signed-in user's active membership in `groupId`, plus the group. Anything else
 * (bad id, no membership, deactivated) is a 404 so group ids can't be probed.
 */
export const requireMember = cache(async (groupId: string) => {
  const user = await requireUser();
  const row = await findActiveMembership(groupId, user.id);
  if (!row) notFound();
  return { user, ...row };
});

/** Non-throwing variant for route handlers. */
export async function findActiveMembership(groupId: string, userId: string) {
  if (!z.uuid().safeParse(groupId).success) return null;
  const [row] = await db
    .select({ member: schema.members, group: schema.groups })
    .from(schema.members)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.members.groupId))
    .where(and(eq(schema.members.groupId, groupId), eq(schema.members.userId, userId)));
  return row && hasAccess(row.member) ? row : null;
}
