import { describe, expect, it } from "vitest";
import { computeBalances, type LedgerEntry } from "./balances";
import { csvCell } from "./csv";
import { CURRENCIES, CURRENCY_CODES, currencyName } from "./currencies";
import { convert, formatMoney, parseAmount, toDecimalString } from "./money";
import { simplifyDebts } from "./simplify";
import { allocate, computeShares } from "./split";

const sum = (xs: { shareMinor: number }[]) => xs.reduce((a, s) => a + s.shareMinor, 0);

describe("money", () => {
  it("parses amounts into minor units", () => {
    expect(parseAmount("12", "USD")).toBe(1200);
    expect(parseAmount("12.5", "USD")).toBe(1250);
    expect(parseAmount("1,234.56", "USD")).toBe(123456);
    expect(parseAmount("0.07", "USD")).toBe(7);
    expect(parseAmount("500", "JPY")).toBe(500);
  });
  it("rejects malformed amounts", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1e3", "1.2.3"]) expect(parseAmount(bad, "USD")).toBeNull();
    expect(parseAmount("5.5", "JPY")).toBeNull();
  });
  it("formats and round-trips", () => {
    expect(toDecimalString(7, "USD")).toBe("0.07");
    expect(toDecimalString(-123456, "USD")).toBe("-1234.56");
    expect(toDecimalString(500, "JPY")).toBe("500");
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
  });
  it("converts across different decimal places", () => {
    expect(convert(1000, "USD", "JPY", 150)).toBe(1500); // $10 -> ¥1500
    expect(convert(1500, "JPY", "USD", 1 / 150)).toBe(1000);
    expect(convert(1000, "EUR", "EUR", 2)).toBe(1000);
  });
});

describe("currencies", () => {
  it("covers every current currency with the right decimal places", () => {
    expect(CURRENCY_CODES.length).toBeGreaterThan(150);
    expect([CURRENCIES.USD, CURRENCIES.JPY, CURRENCIES.KWD, CURRENCIES.VND]).toEqual([2, 0, 3, 0]);
    expect(currencyName("VND")).toBe("Vietnamese Dong");
  });
  it("keeps the decimals existing amounts were stored with", () => {
    // These were 2 when the app launched; changing them would rescale stored amounts.
    expect([CURRENCIES.HUF, CURRENCIES.IDR, CURRENCIES.ISK, CURRENCIES.KRW]).toEqual([2, 2, 0, 0]);
  });
  it("formats a 3-decimal currency", () => {
    expect(parseAmount("1.234", "KWD")).toBe(1234);
    expect(toDecimalString(1234, "KWD")).toBe("1.234");
  });
});

describe("computeShares", () => {
  it("splits equally and hands leftover cents out deterministically", () => {
    const r = computeShares(1000, "equal", [{ memberId: "c", value: 0 }, { memberId: "a", value: 0 }, { memberId: "b", value: 0 }]);
    expect(r).toEqual({ ok: true, shares: [{ memberId: "c", shareMinor: 333 }, { memberId: "a", shareMinor: 334 }, { memberId: "b", shareMinor: 333 }] });
  });
  it("splits by exact amounts and rejects wrong totals", () => {
    expect(computeShares(1000, "exact", [{ memberId: "a", value: 600 }, { memberId: "b", value: 400 }]).ok).toBe(true);
    const bad = computeShares(1000, "exact", [{ memberId: "a", value: 600 }, { memberId: "b", value: 300 }]);
    expect(bad.ok).toBe(false);
  });
  it("splits by percent and requires 100%", () => {
    const r = computeShares(1001, "percent", [{ memberId: "a", value: 50 }, { memberId: "b", value: 50 }]);
    expect(r.ok && sum(r.shares)).toBe(1001);
    expect(computeShares(1000, "percent", [{ memberId: "a", value: 50 }, { memberId: "b", value: 40 }]).ok).toBe(false);
  });
  it("drops people whose share is zero", () => {
    const r = computeShares(900, "percent", [{ memberId: "a", value: 75 }, { memberId: "b", value: 25 }, { memberId: "c", value: 0 }]);
    expect(r).toEqual({ ok: true, shares: [{ memberId: "a", shareMinor: 675 }, { memberId: "b", shareMinor: 225 }] });
  });
  it("rejects invalid input", () => {
    expect(computeShares(0, "equal", [{ memberId: "a", value: 0 }]).ok).toBe(false);
    expect(computeShares(100, "equal", []).ok).toBe(false);
    expect(computeShares(100, "equal", [{ memberId: "a", value: 0 }, { memberId: "a", value: 0 }]).ok).toBe(false);
    expect(computeShares(100, "percent", [{ memberId: "a", value: -1 }, { memberId: "b", value: 101 }]).ok).toBe(false);
    expect(computeShares(100, "exact", [{ memberId: "a", value: 0 }]).ok).toBe(false);
  });
  it("always allocates the full total", () => {
    for (let total = 1; total < 500; total += 7) {
      expect(sum(allocate(total, [{ memberId: "a", weight: 1 }, { memberId: "b", weight: 3 }, { memberId: "c", weight: 7 }]))).toBe(total);
    }
  });
});

describe("balances + simplify", () => {
  const entries: LedgerEntry[] = [
    // A pays $30 dinner split equally between A, B, C
    { payerMemberId: "A", amountMinor: 3000, currency: "USD", fxRate: 1, splits: [{ memberId: "A", shareMinor: 1000 }, { memberId: "B", shareMinor: 1000 }, { memberId: "C", shareMinor: 1000 }] },
    // B pays €10 split between B and C, at 1 EUR = 1.1 USD
    { payerMemberId: "B", amountMinor: 1000, currency: "EUR", fxRate: 1.1, splits: [{ memberId: "B", shareMinor: 500 }, { memberId: "C", shareMinor: 500 }] },
    // C settles $5 to A
    { payerMemberId: "C", amountMinor: 500, currency: "USD", fxRate: 1, splits: [{ memberId: "A", shareMinor: 500 }] },
  ];

  it("nets every member and sums to zero", () => {
    const b = computeBalances(entries, "USD");
    expect(Object.fromEntries(b)).toEqual({ A: 1500, B: -450, C: -1050 });
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
  it("stays zero-sum with awkward currency conversion", () => {
    const b = computeBalances([{ payerMemberId: "A", amountMinor: 1001, currency: "EUR", fxRate: 1.0937, splits: [{ memberId: "A", shareMinor: 334 }, { memberId: "B", shareMinor: 334 }, { memberId: "C", shareMinor: 333 }] }], "USD");
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });
  it("suggests minimal transfers that settle everyone", () => {
    const t = simplifyDebts(computeBalances(entries, "USD"));
    expect(t).toEqual([
      { from: "C", to: "A", amountMinor: 1050 },
      { from: "B", to: "A", amountMinor: 450 },
    ]);
  });
});

describe("csv", () => {
  it("neutralises formulas and quotes special characters", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("Dinner, drinks")).toBe("\"Dinner, drinks\"");
    expect(csvCell(-5)).toBe("-5");
  });
});
