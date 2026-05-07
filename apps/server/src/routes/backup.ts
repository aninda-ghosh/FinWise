import { Hono } from "hono";
import { getDb } from "../db/index";
import {
  accounts,
  ai_conversations,
  ai_messages,
  ai_tool_calls,
  budget_alerts,
  envelope_groups,
  envelopes,
  exchange_rates,
  investments,
  policies,
  policy_payouts,
  price_history,
  recurring_transactions,
  transactions,
} from "../db/schema";

export const backupRouter = new Hono();

backupRouter.get("/export", async (c) => {
  const db = getDb();
  try {
    const [
      accountRows,
      envelopeGroupRows,
      envelopeRows,
      transactionRows,
      budgetAlertRows,
      recurringRows,
      investmentRows,
      priceHistoryRows,
      policyRows,
      policyPayoutRows,
      exchangeRateRows,
      aiConversationRows,
      aiMessageRows,
      aiToolCallRows,
    ] = await Promise.all([
      db.select().from(accounts),
      db.select().from(envelope_groups),
      db.select().from(envelopes),
      db.select().from(transactions),
      db.select().from(budget_alerts),
      db.select().from(recurring_transactions),
      db.select().from(investments),
      db.select().from(price_history),
      db.select().from(policies),
      db.select().from(policy_payouts),
      db.select().from(exchange_rates),
      db.select().from(ai_conversations),
      db.select().from(ai_messages),
      db.select().from(ai_tool_calls),
    ]);

    return c.json({
      version: "1",
      exported_at: new Date().toISOString(),
      data: {
        accounts: accountRows,
        envelope_groups: envelopeGroupRows,
        envelopes: envelopeRows,
        transactions: transactionRows,
        budget_alerts: budgetAlertRows,
        recurring_transactions: recurringRows,
        investments: investmentRows,
        price_history: priceHistoryRows,
        policies: policyRows,
        policy_payouts: policyPayoutRows,
        exchange_rates: exchangeRateRows,
        ai_conversations: aiConversationRows,
        ai_messages: aiMessageRows,
        ai_tool_calls: aiToolCallRows,
      },
    });
  } catch (err) {
    console.error("Export failed:", err);
    return c.json({ error: "Export failed" }, 500);
  }
});

backupRouter.post("/import", async (c) => {
  const db = getDb();
  try {
    const body = await c.req.json();
    if (!body?.data) return c.json({ error: "Invalid backup file" }, 400);

    const d = body.data;

    // Delete in FK-safe reverse order
    await db.delete(ai_tool_calls);
    await db.delete(ai_messages);
    await db.delete(ai_conversations);
    await db.delete(budget_alerts);
    await db.delete(recurring_transactions);
    await db.delete(transactions);
    await db.delete(envelopes);
    await db.delete(envelope_groups);
    await db.delete(accounts);
    await db.delete(price_history);
    await db.delete(policy_payouts);
    await db.delete(policies);
    await db.delete(investments);
    await db.delete(exchange_rates);

    // Insert in FK-safe order
    if (d.exchange_rates?.length) await db.insert(exchange_rates).values(d.exchange_rates);
    if (d.accounts?.length) await db.insert(accounts).values(d.accounts);
    if (d.envelope_groups?.length) await db.insert(envelope_groups).values(d.envelope_groups);
    if (d.envelopes?.length) await db.insert(envelopes).values(d.envelopes);
    if (d.transactions?.length) await db.insert(transactions).values(d.transactions);
    if (d.budget_alerts?.length) await db.insert(budget_alerts).values(d.budget_alerts);
    if (d.recurring_transactions?.length) await db.insert(recurring_transactions).values(d.recurring_transactions);
    if (d.investments?.length) await db.insert(investments).values(d.investments);
    if (d.price_history?.length) await db.insert(price_history).values(d.price_history);
    if (d.policies?.length) await db.insert(policies).values(d.policies);
    if (d.policy_payouts?.length) await db.insert(policy_payouts).values(d.policy_payouts);
    if (d.ai_conversations?.length) await db.insert(ai_conversations).values(d.ai_conversations);
    if (d.ai_messages?.length) await db.insert(ai_messages).values(d.ai_messages);
    if (d.ai_tool_calls?.length) await db.insert(ai_tool_calls).values(d.ai_tool_calls);

    return c.json({ success: true });
  } catch (err) {
    console.error("Import failed:", err);
    return c.json({ error: "Import failed" }, 500);
  }
});
