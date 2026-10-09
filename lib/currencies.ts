// Currencies supported by the Frankfurter exchange-rate API, with ISO 4217 minor-unit digits.
export const CURRENCIES = {
  AUD: 2, BRL: 2, CAD: 2, CHF: 2, CNY: 2, CZK: 2, DKK: 2, EUR: 2, GBP: 2, HKD: 2,
  HUF: 2, IDR: 2, ILS: 2, INR: 2, ISK: 0, JPY: 0, KRW: 0, MXN: 2, MYR: 2, NOK: 2,
  NZD: 2, PHP: 2, PLN: 2, RON: 2, SEK: 2, SGD: 2, THB: 2, TRY: 2, USD: 2, ZAR: 2,
} as const;

export type Currency = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function isCurrency(code: string): code is Currency {
  return Object.hasOwn(CURRENCIES, code);
}
