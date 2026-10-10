import "server-only";
import { cacheLife } from "next/cache";
import { isCurrency, type Currency } from "./currencies";

// Daily reference rates for 150+ currencies from the free, open-source fawazahmed0 currency API
// (no key, CC0). Served from two independent hosts; the second is used if the first fails.
const SOURCES = (base: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`,
  `https://latest.currency-api.pages.dev/v1/currencies/${base}.json`,
];

/** Units of `to` per one unit of `from`. */
export async function getRate(from: Currency, to: Currency): Promise<number> {
  if (from === to) return 1;
  return (await getRates(from))[to] ?? Promise.reject(new Error(`No rate for ${from}->${to}`));
}

/** All rates for a base currency, cached on the server for a day. */
export async function getRates(base: Currency): Promise<Partial<Record<Currency, number>>> {
  "use cache";
  cacheLife("days");
  // Only codes from the fixed currency list ever reach the URL.
  if (!isCurrency(base)) throw new Error("Unsupported currency");
  const key = base.toLowerCase();

  let body: Record<string, Record<string, number>> | null = null;
  for (const url of SOURCES(key)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        body = await res.json();
        break;
      }
    } catch {
      // Try the next host.
    }
  }
  if (!body?.[key]) throw new Error("Exchange rate lookup failed");

  const rates: Partial<Record<Currency, number>> = { [base]: 1 };
  for (const [code, rate] of Object.entries(body[key])) {
    const upper = code.toUpperCase();
    if (isCurrency(upper) && Number.isFinite(rate) && rate > 0) rates[upper] = rate;
  }
  return rates;
}
