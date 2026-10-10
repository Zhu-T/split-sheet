import { describe, expect, it } from "vitest";
import type { ExpenseSnapshot } from "@/db/schema";
import { describeChanges, describeEvent, snapshotsDiffer } from "./history";

const names: Record<string, string> = { a: "Tony", b: "Alex", c: "Sam", d: "Jordan" };
const nameOf = (id: string) => names[id] ?? "Someone";
const money = (minor: number, currency: string) => `${currency === "USD" ? "$" : "€"}${(minor / 100).toFixed(2)}`;

const base: ExpenseSnapshot = {
  kind: "expense",
  description: "Dinner",
  amountMinor: 9000,
  currency: "USD",
  fxRate: 1,
  date: "2026-10-08",
  payerId: "a",
  splitType: "equal",
  splits: [
    { memberId: "a", shareMinor: 3000 },
    { memberId: "b", shareMinor: 3000 },
    { memberId: "c", shareMinor: 3000 },
  ],
};

describe("describeChanges", () => {
  it("lists each changed field in plain words", () => {
    const after: ExpenseSnapshot = { ...base, description: "Omakase", amountMinor: 12000, date: "2026-10-09", payerId: "b", splitType: "exact" };
    expect(describeChanges(base, after, nameOf, money)).toEqual([
      "Description “Dinner” → “Omakase”",
      "Amount $90.00 → $120.00",
      "Date Oct 8, 2026 → Oct 9, 2026",
      "Paid by Tony → Alex",
      "Split equally → by amounts",
    ]);
  });

  it("names people added and removed", () => {
    const after = { ...base, splits: [{ memberId: "a", shareMinor: 4500 }, { memberId: "d", shareMinor: 4500 }] };
    // Tony stays in the split but his share grows, which is worth showing too.
    expect(describeChanges(base, after, nameOf, money)).toEqual([
      "Added Jordan ($45.00)",
      "Removed Alex",
      "Removed Sam",
      "Tony's share $30.00 → $45.00",
    ]);
  });

  it("shows individual share changes when the total is unchanged", () => {
    const after = { ...base, splitType: "exact" as const, splits: [{ memberId: "a", shareMinor: 5000 }, { memberId: "b", shareMinor: 2000 }, { memberId: "c", shareMinor: 2000 }] };
    expect(describeChanges(base, after, nameOf, money)).toEqual([
      "Split equally → by amounts",
      "Tony's share $30.00 → $50.00",
      "Alex's share $30.00 → $20.00",
      "Sam's share $30.00 → $20.00",
    ]);
  });

  it("handles currency changes and payment recipients", () => {
    expect(describeChanges(base, { ...base, currency: "EUR", fxRate: 1.1 }, nameOf, money)).toEqual(["Amount $90.00 → €90.00"]);
    const pay: ExpenseSnapshot = { ...base, kind: "settlement", splitType: "exact", amountMinor: 2000, splits: [{ memberId: "b", shareMinor: 2000 }] };
    expect(describeChanges(pay, { ...pay, splits: [{ memberId: "c", shareMinor: 2000 }] }, nameOf, money)).toEqual(["To Alex → Sam"]);
  });

  it("finds no changes when nothing differs (even if splits are reordered)", () => {
    const reordered = { ...base, splits: [...base.splits].reverse() };
    expect(describeChanges(base, reordered, nameOf, money)).toEqual([]);
    expect(snapshotsDiffer(base, reordered)).toBe(false);
    expect(snapshotsDiffer(base, { ...base, amountMinor: 1 })).toBe(true);
  });
});

describe("describeEvent", () => {
  it("writes short headlines", () => {
    expect(describeEvent("created", "Alex", "expense")).toBe("Alex added this expense");
    expect(describeEvent("deleted", "Tony", "settlement")).toBe("Tony deleted this payment");
    expect(describeEvent("confirmed", "Sam", "settlement")).toBe("Sam confirmed receiving it");
  });
});
