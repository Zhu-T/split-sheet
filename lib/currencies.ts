import { CURRENCY_DATA } from "./currency-data";

// Every current ISO 4217 currency (see scripts/generate-currencies.mjs), with names and decimals.

export type Currency = keyof typeof CURRENCY_DATA;

/** Minor-unit digits per currency (e.g. USD 2, JPY 0, KWD 3). */
export const CURRENCIES = Object.fromEntries(Object.entries(CURRENCY_DATA).map(([code, c]) => [code, c.decimals])) as Record<Currency, number>;

export const CURRENCY_CODES = Object.keys(CURRENCY_DATA) as Currency[];

export function isCurrency(code: string): code is Currency {
  return Object.hasOwn(CURRENCY_DATA, code);
}

export function currencyName(code: Currency): string {
  return CURRENCY_DATA[code].name;
}

/** Shown first in the currency picker (after the person's own currencies). */
export const POPULAR_CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "MXN", "CHF", "CNY", "KRW", "INR", "SGD", "THB"];
