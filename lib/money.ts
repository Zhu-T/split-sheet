import { CURRENCIES, type Currency } from "./currencies";

export function decimals(currency: Currency): number {
  return CURRENCIES[currency];
}

/**
 * Parse a user-typed amount ("12", "12.5", "1,234.50") into integer minor units.
 * Returns null for anything malformed or with too many decimal places.
 */
export function parseAmount(input: string, currency: Currency): number | null {
  const d = decimals(currency);
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, frac = ""] = match;
  if (frac.length > d) return null;
  const minor = Number(whole) * 10 ** d + Number(frac.padEnd(d, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units to a plain decimal string ("1234.50"), for inputs and CSV. */
export function toDecimalString(minor: number, currency: Currency): string {
  const d = decimals(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (d === 0) return `${sign}${abs}`;
  const s = String(abs).padStart(d + 1, "0");
  return `${sign}${s.slice(0, -d)}.${s.slice(-d)}`;
}

export function formatMoney(minor: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals(currency),
    maximumFractionDigits: decimals(currency),
  }).format(minor / 10 ** decimals(currency));
}

/** Convert minor units between currencies; `rate` is units of `to` per one unit of `from`. */
export function convert(minor: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return minor;
  return Math.round(minor * rate * 10 ** (decimals(to) - decimals(from)));
}
