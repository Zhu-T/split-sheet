import "server-only";
import { cacheLife } from "next/cache";
import { isCurrency, type Currency } from "./currencies";

/** Units of `to` per one unit of `from`, from the Frankfurter API (ECB reference rates). */
export async function getRate(from: Currency, to: Currency): Promise<number> {
  if (from === to) return 1;
  return (await getRates(from))[to] ?? Promise.reject(new Error(`No rate for ${from}->${to}`));
}

/** All rates for a base currency, cached on the server for a day. */
export async function getRates(base: Currency): Promise<Partial<Record<Currency, number>>> {
  "use cache";
  cacheLife("days");
  // Only fixed currency codes ever reach the URL.
  if (!isCurrency(base)) throw new Error("Unsupported currency");
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`);
  if (!res.ok) throw new Error(`Exchange rate lookup failed (${res.status})`);
  const body = (await res.json()) as { rates: Record<string, number> };
  const rates: Partial<Record<Currency, number>> = { [base]: 1 };
  for (const [code, rate] of Object.entries(body.rates)) {
    if (isCurrency(code) && Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  return rates;
}
