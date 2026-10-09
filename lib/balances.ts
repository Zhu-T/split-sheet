import type { Currency } from "./currencies";
import { convert } from "./money";
import { allocate, type Share } from "./split";

/** An expense or settlement. A settlement is one split row: the receiver owes the full amount. */
export type LedgerEntry = {
  payerMemberId: string;
  amountMinor: number;
  currency: Currency;
  fxRate: number; // base-currency units per one unit of `currency`
  splits: Share[];
};

/**
 * Net balance per member in base-currency minor units. Positive = is owed money.
 * Each entry's converted split shares are re-allocated so they sum exactly to the
 * converted total, which keeps the whole ledger summing to zero.
 */
export function computeBalances(entries: LedgerEntry[], base: Currency): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);

  for (const e of entries) {
    const totalBase = convert(e.amountMinor, e.currency, base, e.fxRate);
    if (totalBase === 0 || e.splits.length === 0) continue;
    add(e.payerMemberId, totalBase);
    const shares =
      e.currency === base
        ? e.splits
        : allocate(totalBase, e.splits.map((s) => ({ memberId: s.memberId, weight: s.shareMinor })));
    for (const s of shares) add(s.memberId, -s.shareMinor);
  }
  return net;
}
