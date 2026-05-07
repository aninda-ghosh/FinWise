import { getDb } from "./index";
import {
  accounts,
  envelope_groups,
  envelopes,
  exchange_rates,
} from "./schema";

const db = getDb();

await db.insert(accounts).values([
  { name: "HDFC Savings", type: "savings", currency: "INR", balance: 50000 },
  { name: "Wise USD", type: "checking", currency: "USD", balance: 500 },
  { name: "DBS Singapore", type: "savings", currency: "SGD", balance: 1000 },
]);

await db.insert(exchange_rates).values([
  { from_currency: "USD", rate_to_inr: 83.5, source: "manual" },
  { from_currency: "SGD", rate_to_inr: 62.0, source: "manual" },
  { from_currency: "NTD", rate_to_inr: 2.6, source: "manual" },
]);

const [monthlyGroup] = await db
  .insert(envelope_groups)
  .values({ name: "Monthly Expenses", sort_order: 0 })
  .returning();

const [savingsGroup] = await db
  .insert(envelope_groups)
  .values({ name: "Savings Goals", sort_order: 1 })
  .returning();

const currentMonth = new Date().toISOString().slice(0, 7);

await db.insert(envelopes).values([
  { group_id: monthlyGroup.id, name: "Groceries", budgeted: 8000, month: currentMonth },
  { group_id: monthlyGroup.id, name: "Utilities", budgeted: 3000, month: currentMonth },
]);

console.log("Seed complete.");
