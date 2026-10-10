import "server-only";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { DIGEST_MIN_GAP_MS, digestMessage, nextPostAllowedAt, type Person, type WebhookPayload } from "./discord";
import { formatMoney } from "./money";
import { asCurrency, balancesFor, loadExpenses } from "./queries";

/** Public base URL for links in messages: APP_URL if set, else Vercel's production domain. */
export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

/** POST to a webhook. Never throws: a broken webhook must not affect the app. */
export async function postWebhook(url: string, body: WebhookPayload): Promise<{ ok: boolean; status?: number }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    // Log the status only, never the URL (it contains the webhook's secret token).
    if (!res.ok) console.error(`Discord webhook failed: HTTP ${res.status}`);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("Discord webhook failed:", err instanceof Error ? err.name : "error");
    return { ok: false };
  }
}

export type DigestResult =
  | { posted: true }
  | { posted: false; reason: "not-connected" | "no-activity" | "failed"; status?: number }
  | { posted: false; reason: "too-soon"; nextAt: Date };

/**
 * Post a group's daily summary, at most once per day (shared by the cron and the manual button).
 * The day's slot is claimed atomically before posting, so the cron and a manual post can't both
 * go out; if Discord rejects the post the slot is released again.
 */
export async function postGroupDigest(
  groupId: string,
  opts: { skipIfQuiet: boolean; mode?: "daily" | "wrap-up" },
): Promise<DigestResult> {
  const now = new Date();
  const wrapUp = opts.mode === "wrap-up";
  const [group] = await db
    .select({
      name: schema.groups.name,
      base: schema.groups.baseCurrency,
      webhook: schema.groups.discordWebhookUrl,
      lastPostedAt: schema.groups.discordLastPostedAt,
      tripStart: schema.groups.tripStart,
      tripEnd: schema.groups.tripEnd,
    })
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId));
  if (!group?.webhook) return { posted: false, reason: "not-connected" };

  const nextAt = nextPostAllowedAt(group.lastPostedAt, now);
  if (nextAt) return { posted: false, reason: "too-soon", nextAt };

  // Daily: everything that changed since the last summary (or the last day, for the first one).
  // Wrap-up: the whole trip, i.e. every expense in the group.
  const since = wrapUp ? new Date(0) : (group.lastPostedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const changed = await db
    .select()
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.groupId, groupId),
        or(gt(schema.expenses.createdAt, since), gt(schema.expenses.updatedAt, since), gt(schema.expenses.deletedAt, since)),
      ),
    );
  if (opts.skipIfQuiet && changed.length === 0) return { posted: false, reason: "no-activity" };

  // Claim today's slot: only succeeds if nobody else posted since we read lastPostedAt.
  const claimed = await db
    .update(schema.groups)
    .set({ discordLastPostedAt: now })
    .where(
      and(
        eq(schema.groups.id, groupId),
        // Unchanged since we checked it was 22h+ old, so nobody else has posted in between.
        group.lastPostedAt ? eq(schema.groups.discordLastPostedAt, group.lastPostedAt) : isNull(schema.groups.discordLastPostedAt),
      ),
    )
    .returning({ id: schema.groups.id });
  if (claimed.length === 0) {
    return { posted: false, reason: "too-soon", nextAt: new Date(now.getTime() + DIGEST_MIN_GAP_MS) };
  }

  const members = await db
    .select({ id: schema.members.id, name: schema.members.displayName, discordId: schema.users.discordId })
    .from(schema.members)
    .leftJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.groupId, groupId));
  const byId = new Map(members.map((m) => [m.id, m]));
  const person = (id: string): Person => ({ name: byId.get(id)?.name ?? "Someone", discordId: byId.get(id)?.discordId ?? null });

  const base = asCurrency(group.base);
  const { transfers } = balancesFor(await loadExpenses(groupId), base);
  const splits = changed.length
    ? await db.select().from(schema.expenseSplits).where(inArray(schema.expenseSplits.expenseId, changed.map((e) => e.id)))
    : [];
  const receiverOf = (expenseId: string) => splits.find((s) => s.expenseId === expenseId)?.memberId;

  const isNew = (e: (typeof changed)[number]) => e.createdAt > since && !e.deletedAt;
  const link = appUrl();
  const body = digestMessage({
    trip: wrapUp && group.tripEnd ? { start: group.tripStart, end: group.tripEnd } : undefined,
    groupName: group.name,
    link: link ? `${link}/groups/${groupId}` : null,
    added: changed
      .filter((e) => e.kind === "expense" && isNew(e))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ description: e.description, amount: formatMoney(e.amountMinor, asCurrency(e.currency)), payer: person(e.payerMemberId) })),
    payments: changed
      .filter((e) => e.kind === "settlement" && isNew(e))
      .map((e) => ({ from: person(e.payerMemberId), to: person(receiverOf(e.id) ?? ""), amount: formatMoney(e.amountMinor, asCurrency(e.currency)) })),
    edited: wrapUp ? 0 : changed.filter((e) => !e.deletedAt && e.createdAt <= since && e.updatedAt > since).length,
    deleted: wrapUp ? 0 : changed.filter((e) => e.deletedAt && e.createdAt <= since).length,
    owes: transfers.map((t) => ({ from: person(t.from), to: person(t.to), amount: formatMoney(t.amountMinor, base) })),
  });

  const res = await postWebhook(group.webhook, body);
  if (!res.ok) {
    // Give the slot back so the post can be retried today.
    await db
      .update(schema.groups)
      .set({ discordLastPostedAt: group.lastPostedAt })
      .where(and(eq(schema.groups.id, groupId), eq(schema.groups.discordLastPostedAt, now)));
    return { posted: false, reason: "failed", status: res.status };
  }
  return { posted: true };
}
