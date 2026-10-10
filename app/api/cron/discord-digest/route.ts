import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { automaticPostPlan } from "@/lib/discord";
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
 * Daily (see vercel.json), for each group with a channel connected and notifications on:
 * nothing while its trip is in progress; one trip wrap-up once it ends; after that (or with no
 * trip dates) a daily summary when something changed. Never more than one post a day.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const groups = await db
    .select({ id: schema.groups.id, tripEnd: schema.groups.tripEnd, lastPostedAt: schema.groups.discordLastPostedAt })
    .from(schema.groups)
    .where(and(isNotNull(schema.groups.discordWebhookUrl), eq(schema.groups.discordAutoDigest, true)));

  const now = new Date();
  const counts: Record<string, number> = {};
  for (const g of groups) {
    const plan = automaticPostPlan(g.tripEnd, g.lastPostedAt, now);
    let key: string;
    if (plan === "wait") {
      key = "trip-in-progress";
    } else {
      // The end-of-trip wrap-up always goes out; daily summaries only when something changed.
      const r = await postGroupDigest(g.id, { skipIfQuiet: plan === "daily", mode: plan });
      key = r.posted ? `posted-${plan}` : r.reason;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Response.json({ groups: groups.length, ...counts });
}
