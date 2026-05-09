import { parse } from "csv-parse/sync";
import { and, desc, eq, gte, like, lt, lte, or, sql } from "drizzle-orm";
import { hashRow } from "@finwise/shared/utils/hash";
import type {
  AccountResponse,
  CreateAccountRequest,
  CreateEnvelopeRequest,
  CreateTransactionRequest,
  EnvelopeWithGroupResponse,
  ImportResult,
  MonthlySummaryResponse,
  PaginatedTransactionsResponse,
  TransactionFilters,
  TransactionResponse,
  TrendResponse,
  UpdateAccountRequest,
  UpdateEnvelopeRequest,
  UpdateTransactionRequest,
} from "@finwise/shared/api-contracts";
import { nanoid } from "nanoid";
import { getDb } from "../db/index";
import {
  accounts,
  envelope_groups,
  envelopes,
  exchange_rates,
  recurring_transactions,
  transactions,
} from "../db/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getLatestRates(): Promise<Record<string, number>> {
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

function toInr(amount: number, currency: string, rates: Record<string, number>): number {
  if (currency === "INR") return amount;
  return amount * (rates[currency] ?? 1);
}

function toAccountResponse(
  row: typeof accounts.$inferSelect,
  rates: Record<string, number>
): AccountResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountResponse["type"],
    currency: (row.currency ?? "INR") as AccountResponse["currency"],
    balance: row.balance ?? 0,
    balance_inr: toInr(row.balance ?? 0, row.currency ?? "INR", rates),
    institution: row.institution ?? null,
    is_active: row.is_active ?? true,
    off_budget: row.off_budget ?? false,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function toTransactionResponse(row: typeof transactions.$inferSelect & { currency?: string | null }): TransactionResponse {
  return {
    id: row.id,
    account_id: row.account_id,
    envelope_id: row.envelope_id ?? null,
    payee: row.payee,
    amount: row.amount,
    currency: row.currency ?? "INR",
    type: row.type as TransactionResponse["type"],
    date: row.date,
    notes: row.notes ?? null,
    income_category: (row.income_category as TransactionResponse["income_category"]) ?? null,
    created_at: row.created_at ?? "",
  };
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<AccountResponse[]> {
  const db = getDb();
  const rates = await getLatestRates();
  const rows = await db.select().from(accounts).orderBy(accounts.name);

  // Build a currency map for each account
  const accountCurrency: Record<string, string> = {};
  for (const r of rows) accountCurrency[r.id] = r.currency ?? "INR";

  // Compute live balance from transactions for every account atomically.
  // Transaction amounts are stored in the account's native currency.
  // We accumulate the native delta per account, then convert to INR at the end.
  const txnTotals = await db
    .select({
      account_id: transactions.account_id,
      type: transactions.type,
      payee: transactions.payee,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .groupBy(transactions.account_id, transactions.type, transactions.payee);

  // Build per-account native delta (income/expense/transfers)
  const txnDeltaNative: Record<string, number> = {};
  for (const t of txnTotals) {
    if (!t.account_id) continue;
    const prev = txnDeltaNative[t.account_id] ?? 0;
    if (t.type === "income") txnDeltaNative[t.account_id] = prev + t.total;
    else if (t.type === "expense") txnDeltaNative[t.account_id] = prev - t.total;
    else if (t.type === "transfer" && t.payee === "Transfer in") txnDeltaNative[t.account_id] = prev + t.total;
    else if (t.type === "transfer" && t.payee === "Transfer out") txnDeltaNative[t.account_id] = prev - t.total;
  }

  return rows.map((r) => {
    const currency = r.currency ?? "INR";
    // Debt accounts (credit/loan) are liabilities — balance must always be negative.
    // Normalize here so old accounts created with a positive balance still behave correctly.
    const startBalance = (r.type === "credit" || r.type === "loan")
      ? -Math.abs(r.balance ?? 0)
      : (r.balance ?? 0);
    const liveNative = startBalance + (txnDeltaNative[r.id] ?? 0);
    // Convert live native balance to INR
    const liveInr = toInr(liveNative, currency, rates);

    return {
      id: r.id,
      name: r.name,
      type: r.type as AccountResponse["type"],
      currency: currency as AccountResponse["currency"],
      balance: liveNative,
      balance_inr: liveInr,
      institution: r.institution ?? null,
      is_active: r.is_active ?? true,
      off_budget: r.off_budget ?? false,
      created_at: r.created_at ?? "",
      updated_at: r.updated_at ?? "",
    };
  });
}

export async function createAccount(data: CreateAccountRequest): Promise<AccountResponse> {
  const db = getDb();
  const rates = await getLatestRates();

  const isDebt = data.type === "credit" || data.type === "loan";
  const openingBalance = isDebt
    ? -Math.abs(data.balance ?? 0)
    : (data.balance ?? 0);
  const shouldSeedTransaction =
    openingBalance > 0 && !data.off_budget && !isDebt;

  const [row] = await db
    .insert(accounts)
    .values({ ...data, balance: shouldSeedTransaction ? 0 : openingBalance })
    .returning();

  if (shouldSeedTransaction) {
    await db.insert(transactions).values({
      account_id: row.id,
      payee: "Starting Balance",
      amount: openingBalance,
      type: "income",
      date: new Date().toISOString().slice(0, 10),
      income_category: "starting_balance",
    });
  }

  return toAccountResponse(row, rates);
}

export async function updateAccount(
  id: string,
  data: UpdateAccountRequest
): Promise<AccountResponse> {
  const db = getDb();
  const rates = await getLatestRates();
  const [row] = await db
    .update(accounts)
    .set({ ...data, updated_at: new Date().toISOString() })
    .where(eq(accounts.id, id))
    .returning();
  if (!row) throw Object.assign(new Error("Account not found"), { status: 404 });
  return toAccountResponse(row, rates);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Reverse envelope charges before deleting transactions so envelopes stay accurate.
    const acctTxns = await tx.select().from(transactions).where(eq(transactions.account_id, id));
    for (const t of acctTxns) {
      if (t.envelope_id && (t.type === "expense" || (t.type === "transfer" && t.payee === "Transfer out"))) {
        await tx.update(envelopes)
          .set({ spent: sql`${envelopes.spent} - ${t.amount}` })
          .where(eq(envelopes.id, t.envelope_id));
      }
    }

    await tx.delete(recurring_transactions).where(eq(recurring_transactions.account_id, id));
    await tx.delete(transactions).where(eq(transactions.account_id, id));
    const result = await tx.delete(accounts).where(eq(accounts.id, id)).returning();
    if (result.length === 0) throw Object.assign(new Error("Account not found"), { status: 404 });
  });
}

// ─── Envelopes ────────────────────────────────────────────────────────────────

async function seedMonthFromTemplate(db: ReturnType<typeof getDb>, month: string) {
  // Find the most recent month that has envelopes to use as template
  const template = await db
    .select({ month: envelopes.month })
    .from(envelopes)
    .orderBy(desc(envelopes.month))
    .limit(1);

  if (template.length === 0) return; // no envelopes exist at all, nothing to seed from

  const srcMonth = template[0].month;
  const srcRows = await db
    .select({ group_id: envelopes.group_id, name: envelopes.name })
    .from(envelopes)
    .where(eq(envelopes.month, srcMonth));

  if (srcRows.length === 0) return;

  await db.insert(envelopes).values(
    srcRows.map((r) => ({
      group_id: r.group_id,
      name: r.name,
      month,
      budgeted: 0,
      budget_currency: "INR" as const,
    }))
  );
}

export async function listEnvelopes(month: string): Promise<EnvelopeWithGroupResponse[]> {
  const db = getDb();
  const rates = await getLatestRates();

  let rows = await db
    .select({
      id: envelopes.id,
      group_id: envelopes.group_id,
      group_name: envelope_groups.name,
      name: envelopes.name,
      budgeted: envelopes.budgeted,
      budget_currency: envelopes.budget_currency,
      month: envelopes.month,
      rollover_type: envelopes.rollover_type,
      rollover_amount: envelopes.rollover_amount,
      created_at: envelopes.created_at,
    })
    .from(envelopes)
    .innerJoin(envelope_groups, eq(envelopes.group_id, envelope_groups.id))
    .where(eq(envelopes.month, month))
    .orderBy(envelope_groups.sort_order, envelopes.name);

  // Auto-seed this month from the most recent month if it has no envelopes yet
  if (rows.length === 0) {
    await seedMonthFromTemplate(db, month);
    rows = await db
      .select({
        id: envelopes.id,
        group_id: envelopes.group_id,
        group_name: envelope_groups.name,
        name: envelopes.name,
        budgeted: envelopes.budgeted,
        budget_currency: envelopes.budget_currency,
        month: envelopes.month,
        rollover_type: envelopes.rollover_type,
        rollover_amount: envelopes.rollover_amount,
        created_at: envelopes.created_at,
      })
      .from(envelopes)
      .innerJoin(envelope_groups, eq(envelopes.group_id, envelope_groups.id))
      .where(eq(envelopes.month, month))
      .orderBy(envelope_groups.sort_order, envelopes.name);
  }

  // Compute spent in INR from transactions — join with account currency
  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const dateTo = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;

  const envIds = rows.map(r => r.id);
  const spentRows = envIds.length > 0
    ? await db
        .select({
          envelope_id: transactions.envelope_id,
          amount: transactions.amount,
          currency: accounts.currency,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.account_id, accounts.id))
        .where(and(
          or(eq(transactions.type, "expense"), eq(transactions.type, "transfer")),
          gte(transactions.date, dateFrom),
          lte(transactions.date, dateTo),
        ))
    : [];

  // Sum spent per envelope in INR
  const spentMap: Record<string, number> = {};
  for (const r of spentRows) {
    if (!r.envelope_id) continue;
    const inr = toInr(r.amount, r.currency ?? "INR", rates);
    spentMap[r.envelope_id] = (spentMap[r.envelope_id] ?? 0) + inr;
  }

  // ── Rollover: fetch previous month's envelopes for any that have rollover set ─
  const hasRollover = rows.some(r => r.rollover_type && r.rollover_type !== "none");
  let prevSpentMap: Record<string, number> = {};   // keyed by "group_id|name"
  let prevBudgetedMap: Record<string, number> = {}; // keyed by "group_id|name", value in INR

  if (hasRollover) {
    const [y, m] = month.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1); // month is 1-based, so m-2 gives previous
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const prevRows = await db
      .select({
        id: envelopes.id,
        group_id: envelopes.group_id,
        name: envelopes.name,
        budgeted: envelopes.budgeted,
        budget_currency: envelopes.budget_currency,
      })
      .from(envelopes)
      .where(eq(envelopes.month, prevMonth));

    // Sum spent for previous month envelopes
    const prevDateFrom = `${prevMonth}-01`;
    const [py, pm] = prevMonth.split("-").map(Number);
    const prevDateTo = `${prevMonth}-${String(new Date(py, pm, 0).getDate()).padStart(2, "0")}`;
    const prevEnvIds = prevRows.map(r => r.id);

    const prevSpentRows = prevEnvIds.length > 0
      ? await db
          .select({ envelope_id: transactions.envelope_id, amount: transactions.amount, currency: accounts.currency })
          .from(transactions)
          .leftJoin(accounts, eq(transactions.account_id, accounts.id))
          .where(and(
            or(eq(transactions.type, "expense"), eq(transactions.type, "transfer")),
            gte(transactions.date, prevDateFrom),
            lte(transactions.date, prevDateTo),
          ))
      : [];

    const prevSpentById: Record<string, number> = {};
    for (const r of prevSpentRows) {
      if (!r.envelope_id) continue;
      prevSpentById[r.envelope_id] = (prevSpentById[r.envelope_id] ?? 0) + toInr(r.amount, r.currency ?? "INR", rates);
    }

    for (const pr of prevRows) {
      const key = `${pr.group_id}|${pr.name}`;
      prevBudgetedMap[key] = toInr(pr.budgeted ?? 0, pr.budget_currency ?? "INR", rates);
      prevSpentMap[key] = prevSpentById[pr.id] ?? 0;
    }
  }

  return rows.map((r) => {
    const budgetCurrency = r.budget_currency ?? "INR";
    let budgetedInr = toInr(r.budgeted ?? 0, budgetCurrency, rates);
    const spent = spentMap[r.id] ?? 0;
    const rolloverType = (r.rollover_type ?? "none") as EnvelopeWithGroupResponse["rollover_type"];

    // Apply rollover from previous month
    if (rolloverType !== "none") {
      const key = `${r.group_id}|${r.name}`;
      const prevBudgeted = prevBudgetedMap[key] ?? 0;
      const prevSpent = prevSpentMap[key] ?? 0;
      if (rolloverType === "leftover") {
        const leftover = prevBudgeted - prevSpent;
        if (leftover > 0) budgetedInr += leftover;
      } else if (rolloverType === "amount") {
        budgetedInr += toInr(r.rollover_amount ?? 0, budgetCurrency, rates);
      }
    }

    return {
      id: r.id,
      group_id: r.group_id,
      group_name: r.group_name,
      name: r.name,
      budgeted: r.budgeted ?? 0,
      budget_currency: budgetCurrency,
      budgeted_inr: budgetedInr,
      spent,
      available: budgetedInr - spent,
      month: r.month,
      rollover_type: rolloverType,
      rollover_amount: r.rollover_amount ?? 0,
      created_at: r.created_at ?? "",
    };
  });
}

export async function createEnvelope(data: CreateEnvelopeRequest) {
  const db = getDb();
  const rates = await getLatestRates();
  const [row] = await db.insert(envelopes).values(data).returning();
  const budgetCurrency = row.budget_currency ?? "INR";
  const budgetedInr = toInr(row.budgeted ?? 0, budgetCurrency, rates);
  return {
    id: row.id,
    group_id: row.group_id,
    name: row.name,
    budgeted: row.budgeted ?? 0,
    budget_currency: budgetCurrency,
    budgeted_inr: budgetedInr,
    spent: 0,
    available: budgetedInr,
    month: row.month,
    rollover_type: (row.rollover_type ?? "none") as "none" | "amount" | "leftover",
    rollover_amount: row.rollover_amount ?? 0,
    created_at: row.created_at ?? "",
  };
}

export async function updateEnvelope(id: string, data: UpdateEnvelopeRequest) {
  const db = getDb();
  const [row] = await db
    .update(envelopes)
    .set(data)
    .where(eq(envelopes.id, id))
    .returning();
  if (!row) throw Object.assign(new Error("Envelope not found"), { status: 404 });
  return {
    id: row.id,
    group_id: row.group_id,
    name: row.name,
    budgeted: row.budgeted ?? 0,
    spent: row.spent ?? 0,
    available: (row.budgeted ?? 0) - (row.spent ?? 0),
    month: row.month,
    rollover_type: (row.rollover_type ?? "none") as "none" | "amount" | "leftover",
    rollover_amount: row.rollover_amount ?? 0,
    created_at: row.created_at ?? "",
  };
}

export async function listEnvelopeGroups() {
  const db = getDb();
  return db.select().from(envelope_groups).orderBy(envelope_groups.sort_order);
}

export async function createEnvelopeGroup(name: string) {
  const db = getDb();
  const existing = await db.select({ n: sql<number>`count(*)` }).from(envelope_groups);
  const sort_order = Number(existing[0]?.n ?? 0);
  const [row] = await db.insert(envelope_groups).values({ name, sort_order }).returning();
  return row;
}

export async function updateEnvelopeGroup(id: string, name: string) {
  const db = getDb();
  const [row] = await db.update(envelope_groups).set({ name }).where(eq(envelope_groups.id, id)).returning();
  if (!row) throw Object.assign(new Error("Group not found"), { status: 404 });
  return row;
}

export async function deleteEnvelopeGroup(id: string) {
  const db = getDb();
  // Get all envelopes in this group so we can clean up their transactions
  const groupEnvelopes = await db.select({ id: envelopes.id }).from(envelopes).where(eq(envelopes.group_id, id));
  if (groupEnvelopes.length > 0) {
    const envIds = groupEnvelopes.map(e => e.id);
    // Nullify FK on transactions for all envelopes in this group
    for (const envId of envIds) {
      await db.update(transactions).set({ envelope_id: null }).where(eq(transactions.envelope_id, envId));
    }
    // Delete all envelopes in the group
    await db.delete(envelopes).where(eq(envelopes.group_id, id));
  }
  const result = await db.delete(envelope_groups).where(eq(envelope_groups.id, id)).returning();
  if (result.length === 0) throw Object.assign(new Error("Group not found"), { status: 404 });
}

export async function deleteEnvelope(id: string): Promise<void> {
  const db = getDb();
  // Nullify FK on transactions first so the delete doesn't hit a constraint
  await db.update(transactions).set({ envelope_id: null }).where(eq(transactions.envelope_id, id));
  const result = await db.delete(envelopes).where(eq(envelopes.id, id)).returning();
  if (result.length === 0) throw Object.assign(new Error("Envelope not found"), { status: 404 });
}

export async function reclaimEnvelopeToPool(
  id: string
): Promise<{ reclaimed_inr: number }> {
  const db = getDb();
  const rates = await getLatestRates();

  const [envelope] = await db.select().from(envelopes).where(eq(envelopes.id, id));
  if (!envelope) throw Object.assign(new Error("Envelope not found"), { status: 404 });

  // Use listEnvelopes to get the true effective available (includes rollover).
  const envList = await listEnvelopes(envelope.month);
  const fullEnv = envList.find(e => e.id === id);
  if (!fullEnv) throw Object.assign(new Error("Envelope not found"), { status: 404 });

  const available = fullEnv.available;  // in INR, includes rollover
  if (available <= 0) {
    throw Object.assign(
      new Error("No surplus to return — this envelope is fully spent or overspent."),
      { status: 400 }
    );
  }

  // Compute the rollover contribution so we can cancel it:
  //   effective_budgeted_inr = raw_budgeted_inr + rollover
  //   available = effective_budgeted_inr - spent
  //   target:  new effective_budgeted_inr = spent  → available becomes 0
  //   so:      new raw_budgeted_inr = spent - rollover
  //   and:     new_budgeted (in budget_currency) = new_raw_budgeted_inr / rate
  const budgetCurrency = (envelope.budget_currency ?? "INR") as string;
  const rate = rates[budgetCurrency] ?? 1;
  const rawBudgetedInr = toInr(envelope.budgeted ?? 0, budgetCurrency, rates);
  const rolloverInr = fullEnv.budgeted_inr - rawBudgetedInr;
  const spent = fullEnv.spent;

  const targetRawInr = spent - rolloverInr;
  const newBudgeted = Math.round((targetRawInr / rate) * 100) / 100;

  await db.update(envelopes).set({ budgeted: newBudgeted }).where(eq(envelopes.id, id));

  return { reclaimed_inr: available };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function listTransactions(
  filters: TransactionFilters
): Promise<PaginatedTransactionsResponse> {
  const db = getDb();
  const conditions = [];

  if (filters.account_id) conditions.push(eq(transactions.account_id, filters.account_id));
  if (filters.envelope_id) conditions.push(eq(transactions.envelope_id, filters.envelope_id));
  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.date_from) conditions.push(gte(transactions.date, filters.date_from));
  if (filters.date_to) conditions.push(lte(transactions.date, filters.date_to));
  if (filters.search) conditions.push(like(transactions.payee, `%${filters.search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: transactions.id,
        account_id: transactions.account_id,
        envelope_id: transactions.envelope_id,
        envelope_name: envelopes.name,
        payee: transactions.payee,
        amount: transactions.amount,
        currency: accounts.currency,
        type: transactions.type,
        date: transactions.date,
        notes: transactions.notes,
        created_at: transactions.created_at,
      })
      .from(transactions)
      .leftJoin(envelopes, eq(transactions.envelope_id, envelopes.id))
      .leftJoin(accounts, eq(transactions.account_id, accounts.id))
      .where(where)
      .orderBy(desc(transactions.date))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(where),
  ]);

  return {
    transactions: rows.map(r => ({
      ...toTransactionResponse(r as any),
      currency: r.currency ?? "INR",
      envelope_name: r.envelope_name ?? null,
    })),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  };
}

export async function createTransaction(
  data: CreateTransactionRequest
): Promise<TransactionResponse | null> {
  const db = getDb();

  // Deduplicate on import_hash — return null to signal "already exists"
  if (data.import_hash) {
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.import_hash, data.import_hash));
    if (existing.length > 0) return null;
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.insert(transactions).values(data).returning();

    // Keep envelope.spent in sync atomically
    if (data.envelope_id && data.type === "expense") {
      await tx.update(envelopes)
        .set({ spent: sql`${envelopes.spent} + ${data.amount}` })
        .where(eq(envelopes.id, data.envelope_id));
    }

    return row;
  });

  return toTransactionResponse(result);
}

export async function updateTransaction(
  id: string,
  data: UpdateTransactionRequest
): Promise<TransactionResponse> {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(transactions).where(eq(transactions.id, id));
    if (!existing) throw Object.assign(new Error("Transaction not found"), { status: 404 });

    const newType = data.type ?? existing.type;
    const newAmount = data.amount ?? existing.amount;
    const newEnvelopeId = data.envelope_id !== undefined ? data.envelope_id : existing.envelope_id;
    const resolvedEnvId = newType === "income" ? null : newEnvelopeId;

    // Reverse old envelope contribution
    const wasTracked = existing.envelope_id && (existing.type === "expense" || existing.type === "transfer");
    if (wasTracked) {
      await tx.update(envelopes)
        .set({ spent: sql`${envelopes.spent} - ${existing.amount}` })
        .where(eq(envelopes.id, existing.envelope_id!));
    }

    // Apply new envelope contribution
    const willTrack = resolvedEnvId && (newType === "expense" || newType === "transfer");
    if (willTrack) {
      await tx.update(envelopes)
        .set({ spent: sql`${envelopes.spent} + ${newAmount}` })
        .where(eq(envelopes.id, resolvedEnvId));
    }

    // Build a properly-typed partial to avoid Drizzle rejecting unknown keys
    const setData: Partial<typeof transactions.$inferInsert> = {};
    if (data.payee !== undefined) setData.payee = data.payee;
    if (data.amount !== undefined) setData.amount = data.amount;
    if (data.date !== undefined) setData.date = data.date;
    if (data.notes !== undefined) setData.notes = data.notes;
    if (newType !== existing.type) setData.type = newType as "income" | "expense" | "transfer";
    if (resolvedEnvId !== existing.envelope_id) setData.envelope_id = resolvedEnvId ?? null;
    if (data.income_category !== undefined) setData.income_category = data.income_category ?? null;

    // If nothing changed, return the existing record without hitting the DB
    if (Object.keys(setData).length === 0) return existing;

    const [updated] = await tx
      .update(transactions)
      .set(setData)
      .where(eq(transactions.id, id))
      .returning();

    return updated;
  });

  return toTransactionResponse(result);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!existing) throw Object.assign(new Error("Transaction not found"), { status: 404 });

    if (existing.transfer_pair_id) {
      // Fetch all legs of the pair so we can reverse whichever side was envelope-charged
      // (the outgoing leg carries the envelope_id; the incoming leg does not).
      // Without this, deleting the "Transfer in" leg would skip the reversal entirely.
      const pairTxns = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.transfer_pair_id, existing.transfer_pair_id));

      for (const t of pairTxns) {
        if (t.envelope_id) {
          await tx.update(envelopes)
            .set({ spent: sql`${envelopes.spent} - ${t.amount}` })
            .where(eq(envelopes.id, t.envelope_id));
        }
      }

      await tx.delete(transactions).where(eq(transactions.transfer_pair_id, existing.transfer_pair_id));
    } else {
      if (existing.envelope_id && (existing.type === "expense" || existing.type === "transfer")) {
        await tx.update(envelopes)
          .set({ spent: sql`${envelopes.spent} - ${existing.amount}` })
          .where(eq(envelopes.id, existing.envelope_id));
      }
      await tx.delete(transactions).where(eq(transactions.id, id));
    }
  });
}

export async function createTransfer(data: {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  to_amount: number;
  date: string;
  notes?: string;
  import_hash?: string;
  envelope_id?: string;
}): Promise<{ from: TransactionResponse; to: TransactionResponse } | null> {
  const db = getDb();

  // Deduplicate on import_hash — return null to signal "already exists"
  if (data.import_hash) {
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.import_hash, data.import_hash));
    if (existing.length > 0) return null;
  }

  const result = await db.transaction(async (tx) => {
    const pairId = nanoid();

    const [from] = await tx.insert(transactions).values({
      account_id: data.from_account_id,
      payee: "Transfer out",
      amount: data.amount,
      type: "transfer",
      date: data.date,
      notes: data.notes ?? null,
      import_hash: data.import_hash ?? null,
      envelope_id: data.envelope_id ?? null,
      transfer_pair_id: pairId,
    }).returning();

    const [to] = await tx.insert(transactions).values({
      account_id: data.to_account_id,
      payee: "Transfer in",
      amount: data.to_amount,
      type: "transfer",
      date: data.date,
      notes: data.notes ?? null,
      transfer_pair_id: pairId,
    }).returning();

    // Charge the envelope on the outgoing side when provided
    if (data.envelope_id) {
      await tx.update(envelopes)
        .set({ spent: sql`${envelopes.spent} + ${data.amount}` })
        .where(eq(envelopes.id, data.envelope_id));
    }

    return { from, to };
  });

  return { from: toTransactionResponse(result.from), to: toTransactionResponse(result.to) };
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

type CsvRow = { date: string; payee: string; amount: string; type: string; notes?: string };

export async function importCSV(
  fileBuffer: Buffer,
  accountId: string,
  _format: string
): Promise<ImportResult> {
  const db = getDb();
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  let rows: CsvRow[];
  try {
    rows = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return { imported: 0, skipped: 0, errors: ["Failed to parse CSV file"] };
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const rawString = JSON.stringify(row);
      const importHash = hashRow(rawString);

      // Check for duplicate
      const existing = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.import_hash, importHash));

      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      const amount = parseFloat(row.amount);
      if (isNaN(amount)) {
        result.errors.push(`Row skipped — invalid amount: "${row.amount}"`);
        continue;
      }

      const type = row.type?.toLowerCase();
      if (!["income", "expense", "transfer"].includes(type)) {
        result.errors.push(`Row skipped — invalid type: "${row.type}"`);
        continue;
      }

      try {
        await tx.insert(transactions).values({
          account_id: accountId,
          payee: row.payee ?? "Unknown",
          amount,
          type: type as "income" | "expense" | "transfer",
          date: row.date,
          notes: row.notes ?? null,
          import_hash: importHash,
        });
        result.imported++;
      } catch (e) {
        result.errors.push(`Row skipped — ${(e as Error).message}`);
      }
    }
  });

  return result;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

// Computes the cumulative unassigned surplus from all months before `month`.
// This is the Actual-style "From Last Month" / TBB carryover:
//   carryover = Σ(income - budgeted) for every prior month
// Positive = you had leftover money; negative = you over-budgeted in the past.
export async function computeCarryoverForMonth(
  month: string,
  rates: Record<string, number>
): Promise<number> {
  const db = getDb();

  const monthDatePrefix = `${month}-01`;

  // All income from on-budget accounts in months before `month`
  const incomeTxns = await db
    .select({ amount: transactions.amount, currency: accounts.currency })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.account_id, accounts.id))
    .where(and(
      eq(transactions.type, "income"),
      eq(accounts.off_budget, false),
      lt(transactions.date, monthDatePrefix),
    ));

  const totalPriorIncome = incomeTxns.reduce(
    (s, t) => s + toInr(t.amount, t.currency ?? "INR", rates), 0
  );

  // All budgeted amounts from envelopes in months before `month`
  const budgetedRows = await db
    .select({ budgeted: envelopes.budgeted, budget_currency: envelopes.budget_currency })
    .from(envelopes)
    .where(lt(envelopes.month, month));

  const totalPriorBudgeted = budgetedRows.reduce(
    (s, e) => s + toInr(e.budgeted ?? 0, e.budget_currency ?? "INR", rates), 0
  );

  return totalPriorIncome - totalPriorBudgeted;
}

export async function getMonthlySummary(month: string): Promise<MonthlySummaryResponse> {
  const db = getDb();

  // Month bounds e.g. "2026-04" → "2026-04-01" to "2026-04-30"
  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const dateTo = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;

  const rates = await getLatestRates();

  const carryoverFromPrevious = await computeCarryoverForMonth(month, rates);

  // Join transactions with their account's currency so we can convert to INR.
  // Exclude off-budget accounts — they track net worth but don't participate in envelope budgeting.
  const txns = await db
    .select({
      id: transactions.id,
      account_id: transactions.account_id,
      envelope_id: transactions.envelope_id,
      amount: transactions.amount,
      type: transactions.type,
      currency: accounts.currency,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.account_id, accounts.id))
    .where(
      and(
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(accounts.off_budget, false)
      )
    );

  // Convert each transaction amount to INR using the account's currency
  const toInrAmount = (amount: number, currency: string | null) =>
    toInr(amount, currency ?? "INR", rates);

  // Transfers excluded from income/expense totals
  const totalIncome = txns
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + toInrAmount(t.amount, t.currency), 0);
  const totalExpenses = txns
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + toInrAmount(t.amount, t.currency), 0);

  // Compute envelope spent in INR from transactions atomically
  const envRows = await listEnvelopes(month);

  const spentByEnvelopeInr = txns
    .filter(t => t.envelope_id && t.type === "expense")
    .reduce<Record<string, number>>((acc, t) => {
      const inr = toInrAmount(t.amount, t.currency);
      acc[t.envelope_id!] = (acc[t.envelope_id!] ?? 0) + inr;
      return acc;
    }, {});

  // Sync denormalised spent column (in INR) so it stays consistent
  await Promise.all([
    ...Object.entries(spentByEnvelopeInr).map(([envId, spent]) =>
      db.update(envelopes).set({ spent }).where(eq(envelopes.id, envId))
    ),
    ...envRows
      .filter(env => !(env.id in spentByEnvelopeInr))
      .map(env => db.update(envelopes).set({ spent: 0 }).where(eq(envelopes.id, env.id))),
  ]);

  return {
    month,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    carryover_from_previous: carryoverFromPrevious,
    envelope_summaries: envRows.map((e) => {
      const spent = spentByEnvelopeInr[e.id] ?? 0;
      return {
        envelope_id: e.id,
        envelope_name: e.name,
        budgeted: e.budgeted,
        spent,
        available: e.budgeted - spent,
      };
    }),
  };
}

export async function getEnvelopeTrends(
  envelopeId: string,
  months: number
): Promise<TrendResponse[]> {
  const db = getDb();

  const rows = await db
    .select({
      month: envelopes.month,
      budgeted: envelopes.budgeted,
      spent: envelopes.spent,
    })
    .from(envelopes)
    .where(eq(envelopes.id, envelopeId))
    .orderBy(desc(envelopes.month))
    .limit(months);

  return rows.map((r) => ({
    month: r.month,
    budgeted: r.budgeted ?? 0,
    spent: r.spent ?? 0,
  }));
}
