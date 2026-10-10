import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { postGroupDigest } from "@/lib/notify";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anything else is rejected. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Daily (see vercel.json): post each connected group's summary if it has the automatic post
 * on, something changed, and nothing has gone out in the last day (e.g. a manual post).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const groups = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(and(isNotNull(schema.groups.discordWebhookUrl), eq(schema.groups.discordAutoDigest, true)));

  const counts: Record<string, number> = {};
  for (const { id } of groups) {
    const r = await postGroupDigest(id, { skipIfQuiet: true });
    const key = r.posted ? "posted" : r.reason;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Response.json({ groups: groups.length, ...counts });
}
