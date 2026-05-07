import { Hono } from "hono";
import { CreateInvestmentSchema, UpdateInvestmentSchema } from "@finwise/shared/schemas";
import * as investmentService from "../services/investment.service";

export const investmentsRouter = new Hono();

function handleError(c: any, err: unknown) {
  const e = err as { status?: number; message?: string };
  if (e.status === 404) return c.json({ error: e.message ?? "Not found" }, 404);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
}

investmentsRouter.get("/", async (c) => {
  try {
    const asset_type = c.req.query("asset_type");
    const sort = c.req.query("sort");
    const investments = await investmentService.listInvestments({ asset_type, sort });
    return c.json({ investments });
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateInvestmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error }, 400);
  try {
    const investment = await investmentService.createInvestment(parsed.data);
    return c.json(investment, 201);
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateInvestmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error }, 400);
  try {
    const investment = await investmentService.updateInvestment(c.req.param("id"), parsed.data);
    return c.json(investment);
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.delete("/:id", async (c) => {
  try {
    await investmentService.deleteInvestment(c.req.param("id"));
    return c.json({ success: true });
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.post("/:id/refresh-price", async (c) => {
  try {
    const result = await investmentService.refreshPrice(c.req.param("id"));
    return c.json(result);
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.get("/:id/price-history", async (c) => {
  try {
    const history = await investmentService.getPriceHistory(
      c.req.param("id"),
      c.req.query("from"),
      c.req.query("to")
    );
    return c.json({ history });
  } catch (err) {
    return handleError(c, err);
  }
});

investmentsRouter.get("/portfolio-summary", async (c) => {
  try {
    const summary = await investmentService.getPortfolioSummary();
    return c.json(summary);
  } catch (err) {
    return handleError(c, err);
  }
});
