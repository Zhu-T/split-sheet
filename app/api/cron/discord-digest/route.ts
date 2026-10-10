import { timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { automaticPostPlan } from "@/lib/discord";
import { archiveCutoffDate, shouldAutoArchive } from "@/lib/rules";
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
 * Daily (see vercel.json):
 * 1. Archive trips that ended more than 20 days ago (unless their owner unarchived them).
 * 2. For each group with a channel connected and notifications on: nothing while its trip is in
 *    progress; one trip wrap-up once it ends; then a daily summary when something changed, until
 *    20 days after the trip. Never more than one post a day.
 * Old trips are filtered out in SQL, so the job's work doesn't grow as trips pile up.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const cutoff = archiveCutoffDate(now); // conservative: the pure rules below make the final call

  // 1. Auto-archive. The SQL narrows to candidates; shouldAutoArchive decides each one.
  const candidates = await db
    .select({ id: schema.groups.id, tripEnd: schema.groups.tripEnd, archivedAt: schema.groups.archivedAt, autoArchive: schema.groups.autoArchive })
    .from(schema.groups)
    .where(and(eq(schema.groups.autoArchive, true), isNull(schema.groups.archivedAt), lte(schema.groups.tripEnd, cutoff)));
  const toArchive = candidates.filter((g) => shouldAutoArchive(g, now)).map((g) => g.id);
  if (toArchive.length) {
    await db.update(schema.groups).set({ archivedAt: now }).where(and(inArray(schema.groups.id, toArchive), isNull(schema.groups.archivedAt)));
  }

  // 2. Summaries, only for groups that could still post: not archived, and no trip end or a recent one.
  const groups = await db
    .select({ id: schema.groups.id, tripEnd: schema.groups.tripEnd, lastPostedAt: schema.groups.discordLastPostedAt })
    .from(schema.groups)
    .where(
      and(
        isNotNull(schema.groups.discordWebhookUrl),
        eq(schema.groups.discordAutoDigest, true),
        isNull(schema.groups.archivedAt),
        or(isNull(schema.groups.tripEnd), gte(schema.groups.tripEnd, cutoff)),
      ),
    );

  const counts: Record<string, number> = { archived: toArchive.length };
  for (const g of groups) {
    const plan = automaticPostPlan(g.tripEnd, g.lastPostedAt, now);
    let key: string;
    if (plan === "wait") {
      key = "trip-in-progress";
    } else if (plan === "stopped") {
      key = "past-cutoff";
    } else {
      // The end-of-trip wrap-up always goes out; daily summaries only when something changed.
      const r = await postGroupDigest(g.id, { skipIfQuiet: plan === "daily", mode: plan });
      key = r.posted ? `posted-${plan}` : r.reason;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Response.json({ groups: groups.length, ...counts });
}
