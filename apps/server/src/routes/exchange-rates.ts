import { Hono } from "hono";
import * as rateService from "../services/exchange-rate.service";

export const exchangeRatesRouter = new Hono();

function handleError(c: any, err: unknown) {
  const e = err as { status?: number; message?: string };
  if (e.status === 400) return c.json({ error: e.message ?? "Bad request" }, 400);
  if (e.status === 503) return c.json({ error: e.message ?? "Service unavailable" }, 503);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
}

// GET /api/exchange-rates — list all latest stored rates
exchangeRatesRouter.get("/", async (c) => {
  try {
    const rates = await rateService.listRates();
    return c.json({ rates });
  } catch (err) {
    return handleError(c, err);
  }
});

// POST /api/exchange-rates/refresh — fetch live rates from web
// Body (optional): { currency: "USD" | "SGD" | "NTD" }
// If currency is omitted, refreshes all three.
exchangeRatesRouter.post("/refresh", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const currency: string | undefined = body?.currency;
    const updated = await rateService.refreshFromWeb(currency);
    return c.json({ updated, count: updated.length });
  } catch (err) {
    return handleError(c, err);
  }
});
