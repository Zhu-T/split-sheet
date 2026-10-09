export type Transfer = { from: string; to: string; amountMinor: number };

/**
 * Turn net balances (positive = is owed) into a short list of payments by repeatedly
 * matching the largest debtor with the largest creditor. Ties break by member id so
 * the suggestion is stable between page loads.
 */
export function simplifyDebts(balances: Map<string, number>): Transfer[] {
  const byAmount = (a: [string, number], b: [string, number]) =>
    b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
  const creditors = [...balances].filter(([, v]) => v > 0).sort(byAmount);
  const debtors = [...balances].filter(([, v]) => v < 0).map(([k, v]) => [k, -v] as [string, number]).sort(byAmount);

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c[1], d[1]);
    transfers.push({ from: d[0], to: c[0], amountMinor: amount });
    c[1] -= amount;
    d[1] -= amount;
    if (c[1] === 0) creditors.shift();
    if (d[1] === 0) debtors.shift();
    creditors.sort(byAmount);
    debtors.sort(byAmount);
  }
  return transfers;
}
