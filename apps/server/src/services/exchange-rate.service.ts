import { desc, eq } from "drizzle-orm";
import type { ExchangeRateResponse } from "@finwise/shared/api-contracts";
import { getDb } from "../db/index";
import { exchange_rates } from "../db/schema";

export async function getLatestRates(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(exchange_rates)
    .orderBy(desc(exchange_rates.fetched_at));

  const latest: Record<string, number> = {};
  for (const row of rows) {
    if (row.from_currency && !latest[row.from_currency]) {
      latest[row.from_currency] = row.rate_to_inr ?? 1;
    }
  }
  return latest;
}

export async function getRate(fromCurrency: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(exchange_rates)
    .where(eq(exchange_rates.from_currency, fromCurrency))
    .orderBy(desc(exchange_rates.fetched_at))
    .limit(1);

  if (!row) throw Object.assign(new Error(`No exchange rate found for ${fromCurrency}`), { status: 404 });
  return row.rate_to_inr ?? 1;
}

export async function saveRate(
  fromCurrency: string,
  rateToInr: number,
  source: string
): Promise<ExchangeRateResponse> {
  const db = getDb();
  const [row] = await db
    .insert(exchange_rates)
    .values({ from_currency: fromCurrency, rate_to_inr: rateToInr, source })
    .returning();

  return {
    from_currency: row.from_currency as ExchangeRateResponse["from_currency"],
    rate_to_inr: row.rate_to_inr ?? rateToInr,
    source: row.source ?? source,
    fetched_at: row.fetched_at ?? new Date().toISOString(),
  };
}

export async function listRates(): Promise<ExchangeRateResponse[]> {
  const rates = await getLatestRates();
  return Object.entries(rates).map(([currency, rate]) => ({
    from_currency: currency as ExchangeRateResponse["from_currency"],
    rate_to_inr: rate,
    source: "stored",
    fetched_at: new Date().toISOString(),
  }));
}

/**
 * Phase 12: Fetch a live exchange rate from open.er-api.com (free, no key required).
 * Only the currency code is sent outbound — no financial data leaves the machine.
 *
 * @param currency  One of "USD" | "SGD" | "NTD". Pass undefined to refresh all three.
 */
export async function refreshFromWeb(
  currency?: string
): Promise<ExchangeRateResponse[]> {
  const SUPPORTED = ["USD", "SGD", "GBP", "EUR", "AUD", "JPY", "TWD", "HKD", "CAD", "NTD"] as const;
  // NTD is stored as NTD but queried as TWD on open.er-api.com
  const API_CODE: Record<string, string> = { NTD: "TWD" };
  const targets = currency
    ? SUPPORTED.filter((c) => c === currency.toUpperCase())
    : [...SUPPORTED];

  if (!targets.length) {
    throw Object.assign(new Error(`Unsupported currency: ${currency}`), { status: 400 });
  }

  const results: ExchangeRateResponse[] = [];

  for (const cur of targets) {
    // Uses free tier — no API key required; returns {"result":"success","rates":{...}}
    const apiCode = API_CODE[cur] ?? cur;
    const url = `https://open.er-api.com/v6/latest/${apiCode}`;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      let data: any;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } finally {
        clearTimeout(id);
      }

      const rateToInr: number = data?.rates?.INR;
      if (!rateToInr || typeof rateToInr !== "number") {
        throw new Error(`No INR rate in response for ${cur}`);
      }

      const saved = await saveRate(cur, rateToInr, "web_search");
      results.push(saved);
    } catch (err) {
      console.error(`[exchange-rate] Failed to refresh ${cur}:`, err);
      // Continue with the next currency rather than failing the whole request
    }
  }

  if (!results.length) {
    throw Object.assign(new Error("All exchange rate refreshes failed — check network"), { status: 503 });
  }

  return results;
}
