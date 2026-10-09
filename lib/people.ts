import type { Currency } from "./currencies";
import { convert } from "./money";
import type { Transfer } from "./simplify";

/** Someone I share a group with. Claimed members are keyed by user so they merge across groups. */
export type Counterpart = { key: string; name: string };

/** What one person and I owe each other in one group, in that group's base currency. Positive = they owe me. */
export type GroupDebt = { person: Counterpart; groupId: string; groupName: string; currency: Currency; amountMinor: number };

/** My side of a group's suggested payments, as signed per-person amounts. */
export function myDebts(
  transfers: Transfer[],
  myMemberId: string,
  counterpartOf: (memberId: string) => Counterpart,
  group: { id: string; name: string; currency: Currency },
): GroupDebt[] {
  const out: GroupDebt[] = [];
  for (const t of transfers) {
    if (t.to === myMemberId) out.push({ person: counterpartOf(t.from), groupId: group.id, groupName: group.name, currency: group.currency, amountMinor: t.amountMinor });
    else if (t.from === myMemberId) out.push({ person: counterpartOf(t.to), groupId: group.id, groupName: group.name, currency: group.currency, amountMinor: -t.amountMinor });
  }
  return out;
}

export type PersonSummary = {
  key: string;
  name: string;
  /** Net in the home currency; positive = they owe me. Null if a rate was missing. */
  netHome: number | null;
  groups: { groupId: string; groupName: string; currency: Currency; amountMinor: number }[];
};

/**
 * Merge per-group debts into one row per person, converted to the home currency.
 * `rates` are units of each currency per one unit of `home`.
 */
export function summarisePeople(debts: GroupDebt[], home: Currency, rates: Partial<Record<Currency, number>>): PersonSummary[] {
  const byKey = new Map<string, PersonSummary>();
  for (const d of debts) {
    const row = byKey.get(d.person.key) ?? { key: d.person.key, name: d.person.name, netHome: 0, groups: [] };
    row.groups.push({ groupId: d.groupId, groupName: d.groupName, currency: d.currency, amountMinor: d.amountMinor });
    const rate = d.currency === home ? 1 : rates[d.currency];
    row.netHome = row.netHome === null || !rate ? null : row.netHome + convert(d.amountMinor, d.currency, home, 1 / rate);
    byKey.set(d.person.key, row);
  }
  return [...byKey.values()]
    .filter((p) => p.netHome !== 0)
    .sort((a, b) => Math.abs(b.netHome ?? 0) - Math.abs(a.netHome ?? 0) || a.name.localeCompare(b.name));
}
