import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { expenseMessage, type Person, type WebhookPayload } from "./discord";
import { formatMoney } from "./money";
import { asCurrency } from "./queries";
import type { Share } from "./split";

/** Public base URL for links in messages: APP_URL if set, else Vercel's production domain. */
function appUrl(): string | null {
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

export type ExpenseChange = {
  groupId: string;
  action: "added" | "edited" | "deleted";
  kind: "expense" | "settlement";
  actorMemberId: string;
  description: string;
  amountMinor: number;
  currency: string;
  payerId: string;
  shares: Share[];
};

/** Post an expense/payment change to the group's Discord channel, if one is connected. */
export async function notifyExpenseChange(c: ExpenseChange): Promise<void> {
  const [group] = await db
    .select({ name: schema.groups.name, webhook: schema.groups.discordWebhookUrl })
    .from(schema.groups)
    .where(eq(schema.groups.id, c.groupId));
  if (!group?.webhook) return;

  const members = await db
    .select({ id: schema.members.id, name: schema.members.displayName, discordId: schema.users.discordId })
    .from(schema.members)
    .leftJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.groupId, c.groupId));
  const byId = new Map(members.map((m) => [m.id, m]));
  const person = (id: string): Person => ({ name: byId.get(id)?.name ?? "Someone", discordId: byId.get(id)?.discordId ?? null });
  const currency = asCurrency(c.currency);
  const base = appUrl();

  await postWebhook(
    group.webhook,
    expenseMessage({
      action: c.action,
      kind: c.kind,
      actor: person(c.actorMemberId),
      description: c.description,
      amount: formatMoney(c.amountMinor, currency),
      payer: person(c.payerId),
      owes: c.shares
        .filter((s) => s.memberId !== c.payerId)
        .map((s) => ({ person: person(s.memberId), amount: formatMoney(s.shareMinor, currency) })),
      groupName: group.name,
      link: base ? `${base}/groups/${c.groupId}` : null,
    }),
  );
}
