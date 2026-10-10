export type SplitType = "equal" | "exact" | "percent";

export const SPLIT_TYPES: SplitType[] = ["equal", "exact", "percent"];

/** `value` is ignored for equal, minor units for exact, a percentage for percent. */
export type SplitInput = { memberId: string; value: number };

export type Share = { memberId: string; shareMinor: number };

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

/**
 * Split `total` minor units proportionally to `weights`. Leftover units go to the largest
 * fractional remainders, ties broken by memberId, so the result always sums to `total`
 * and is identical on every run.
 */
export function allocate(total: number, weights: { memberId: string; weight: number }[]): Share[] {
  const sum = weights.reduce((acc, w) => acc + w.weight, 0);
  if (sum <= 0) throw new Error("allocate: weights must sum to a positive number");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);

  const parts = weights.map((w) => {
    const exact = (abs * w.weight) / sum;
    const floor = Math.floor(exact);
    return { memberId: w.memberId, floor, frac: exact - floor };
  });
  let leftover = abs - parts.reduce((acc, p) => acc + p.floor, 0);
  const order = [...parts].sort(
    (a, b) => b.frac - a.frac || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
  );
  for (const p of order) {
    if (leftover <= 0) break;
    p.floor += 1;
    leftover -= 1;
  }
  return parts.map((p) => ({ memberId: p.memberId, shareMinor: sign * p.floor }));
}

export function computeShares(totalMinor: number, type: SplitType, inputs: SplitInput[]): SplitResult {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (inputs.length === 0) return { ok: false, error: "Pick at least one person" };
  if (new Set(inputs.map((i) => i.memberId)).size !== inputs.length) {
    return { ok: false, error: "A person appears twice in the split" };
  }
  if (inputs.some((i) => !Number.isFinite(i.value) || i.value < 0)) {
    return { ok: false, error: "Split values can't be negative" };
  }

  let shares: Share[];
  switch (type) {
    case "equal":
      shares = allocate(totalMinor, inputs.map((i) => ({ memberId: i.memberId, weight: 1 })));
      break;
    case "exact": {
      if (inputs.some((i) => !Number.isSafeInteger(i.value))) {
        return { ok: false, error: "Exact amounts must be whole minor units" };
      }
      const sum = inputs.reduce((acc, i) => acc + i.value, 0);
      if (sum !== totalMinor) {
        return { ok: false, error: `Amounts add up to ${sum}, not ${totalMinor}` };
      }
      shares = inputs.map((i) => ({ memberId: i.memberId, shareMinor: i.value }));
      break;
    }
    case "percent": {
      const sum = inputs.reduce((acc, i) => acc + i.value, 0);
      if (Math.abs(sum - 100) > 1e-9) {
        return { ok: false, error: `Percentages add up to ${+sum.toFixed(4)}%, not 100%` };
      }
      shares = allocate(totalMinor, inputs.map((i) => ({ memberId: i.memberId, weight: i.value })));
      break;
    }
  }
  return { ok: true, shares: shares.filter((s) => s.shareMinor !== 0) };
}
