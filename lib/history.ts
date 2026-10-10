// Turning expense history snapshots into readable lines (pure, so it's unit tested).
import type { ExpenseSnapshot } from "@/db/schema";

export type EventAction = "created" | "edited" | "deleted" | "restored" | "confirmed";

type NameOf = (memberId: string) => string;
type Money = (minor: number, currency: string) => string;

const SPLIT_LABEL: Record<ExpenseSnapshot["splitType"], string> = { equal: "equally", exact: "by amounts", percent: "by percent" };

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Amount $80.00 → $90.00", "Paid by Alex → Sam", "Added Jordan", … for an edit. */
export function describeChanges(before: ExpenseSnapshot, after: ExpenseSnapshot, nameOf: NameOf, money: Money): string[] {
  const lines: string[] = [];
  if (before.description !== after.description) lines.push(`Description “${before.description}” → “${after.description}”`);
  if (before.amountMinor !== after.amountMinor || before.currency !== after.currency) {
    lines.push(`Amount ${money(before.amountMinor, before.currency)} → ${money(after.amountMinor, after.currency)}`);
  }
  if (before.currency === after.currency && before.currency && before.fxRate !== after.fxRate) {
    lines.push(`Exchange rate ${before.fxRate} → ${after.fxRate}`);
  }
  if (before.date !== after.date) lines.push(`Date ${formatDay(before.date)} → ${formatDay(after.date)}`);
  if (before.payerId !== after.payerId) {
    lines.push(`${after.kind === "settlement" ? "From" : "Paid by"} ${nameOf(before.payerId)} → ${nameOf(after.payerId)}`);
  }
  if (before.splitType !== after.splitType && after.kind === "expense") {
    lines.push(`Split ${SPLIT_LABEL[before.splitType]} → ${SPLIT_LABEL[after.splitType]}`);
  }

  // Per-person shares: who was added, removed, or had their share change.
  const was = new Map(before.splits.map((s) => [s.memberId, s.shareMinor]));
  const now = new Map(after.splits.map((s) => [s.memberId, s.shareMinor]));
  if (after.kind === "settlement") {
    const [from] = before.splits, [to] = after.splits;
    if (from && to && from.memberId !== to.memberId) lines.push(`To ${nameOf(from.memberId)} → ${nameOf(to.memberId)}`);
    return lines;
  }
  for (const [id, share] of now) {
    if (!was.has(id)) lines.push(`Added ${nameOf(id)} (${money(share, after.currency)})`);
  }
  for (const [id] of was) {
    if (!now.has(id)) lines.push(`Removed ${nameOf(id)}`);
  }
  // Only list individual share changes when the total didn't change too (otherwise everyone's
  // share moves and the amount line already explains it).
  if (before.amountMinor === after.amountMinor && before.currency === after.currency) {
    for (const [id, share] of now) {
      const old = was.get(id);
      if (old !== undefined && old !== share) {
        lines.push(`${nameOf(id)}'s share ${money(old, after.currency)} → ${money(share, after.currency)}`);
      }
    }
  }
  return lines;
}

/** Whether an edit changed anything worth recording. */
export function snapshotsDiffer(a: ExpenseSnapshot, b: ExpenseSnapshot): boolean {
  const norm = (s: ExpenseSnapshot) =>
    JSON.stringify({ ...s, splits: [...s.splits].sort((x, y) => (x.memberId < y.memberId ? -1 : 1)) });
  return norm(a) !== norm(b);
}

/** Headline for an event: "Alex added this", "Sam confirmed it", … */
export function describeEvent(action: EventAction, actor: string, kind: ExpenseSnapshot["kind"]): string {
  const thing = kind === "settlement" ? "payment" : "expense";
  switch (action) {
    case "created":
      return `${actor} added this ${thing}`;
    case "edited":
      return `${actor} edited`;
    case "deleted":
      return `${actor} deleted this ${thing}`;
    case "restored":
      return `${actor} restored this ${thing}`;
    case "confirmed":
      return `${actor} confirmed receiving it`;
  }
}
