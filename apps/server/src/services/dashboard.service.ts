import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { DashboardResponse } from "@finwise/shared/api-contracts";
import { getDb } from "../db/index";
import { accounts, policies, transactions } from "../db/schema";
import { getLatestRates } from "./exchange-rate.service";
import { listInvestments } from "./investment.service";
import { listAccounts, listEnvelopes, computeCarryoverForMonth } from "./budget.service";

// ─── Net Worth ────────────────────────────────────────────────────────────────

export async function getNetWorth() {
  const db = getDb();

  const [liveAccounts, allPolicies, invList] = await Promise.all([
    listAccounts(),
    db.select().from(policies),
    listInvestments(),
  ]);

  const active = liveAccounts.filter((a) => a.is_active);

  const cashInr = active
    .filter((a) => !a.off_budget)
    .reduce((s, a) => s + a.balance_inr, 0);

  // Linked account balances (off-budget savings / investment accounts)
  const linkedAccountsInr = active
    .filter((a) => a.off_budget && (a.type === "investment" || a.type === "savings"))
    .reduce((s, a) => s + a.balance_inr, 0);

  // Investment holdings from the investments table
  const holdingsInr = invList.reduce((s, i) => s + i.current_value_inr, 0);

  const investmentsInr = linkedAccountsInr + holdingsInr;

  // Sum the amount owed per debt account individually (matches the Debt page formula)
  const debtInr = active
    .filter((a) => a.type === "credit" || a.type === "loan")
    .reduce((s, a) => s + Math.abs(a.balance_inr), 0);

  const policiesInr = allPolicies.reduce((s, p) => s + (p.surrender_value ?? p.maturity_value ?? 0), 0);

  return {
    // On-budget CC debt is already netted inside cashInr, so don't subtract debtInr here
    total_inr: cashInr + investmentsInr + policiesInr,
    breakdown: {
      cash_inr: cashInr,
      investments_inr: investmentsInr,
      policies_inr: policiesInr,
      debt_inr: debtInr,
    },
  };
}

// ─── Portfolio Breakdown ───────────────────────────────────────────────────────

export async function getPortfolioBreakdown() {
  const [invList, allAccounts] = await Promise.all([listInvestments(), listAccounts()]);

  const byType: Record<string, number> = {};

  for (const inv of invList) {
    byType[inv.asset_type] = (byType[inv.asset_type] ?? 0) + inv.current_value_inr;
  }

  // Include linked account balances (off-budget savings / investment accounts)
  for (const acc of allAccounts) {
    if (acc.off_budget && (acc.type === "savings" || acc.type === "investment")) {
      byType[acc.type] = (byType[acc.type] ?? 0) + acc.balance_inr;
    }
  }

  const total = Object.values(byType).reduce((s, v) => s + v, 0);

  return Object.entries(byType).map(([asset_type, value_inr]) => ({
    asset_type,
    value_inr,
    percentage: total > 0 ? Math.round((value_inr / total) * 10000) / 100 : 0,
  }));
}

// ─── Budget Heatmap ───────────────────────────────────────────────────────────

export async function getBudgetHeatmap(months: number) {
  const rows: { month: string; envelope_name: string; spend_pct: number }[] = [];
  const today = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const envelopes = await listEnvelopes(month);
    for (const env of envelopes) {
      const spendPct = env.budgeted > 0 ? (env.spent / env.budgeted) * 100 : 0;
      rows.push({ month, envelope_name: env.name, spend_pct: Math.round(spendPct * 10) / 10 });
    }
  }

  return rows;
}

// ─── Top Movers ───────────────────────────────────────────────────────────────

export async function getTopMovers(days: number, limit: number) {
  const invList = await listInvestments({ sort: "gain_desc" });
  return invList.slice(0, limit).map((inv) => ({
    investment: inv,
    gain_loss_inr: inv.gain_loss_inr,
    gain_loss_pct: inv.gain_loss_pct,
  }));
}

// ─── Spending Trends ──────────────────────────────────────────────────────────

export async function getSpendingTrends(months = 6): Promise<{ month: string; income: number; expenses: number }[]> {
  const db = getDb();
  const rates = await getLatestRates();
  const results: { month: string; income: number; expenses: number }[] = [];
  const today = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const dateFrom = `${month}-01`;
    const dateTo = `${month}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

    const rows = await db
      .select({ type: transactions.type, amount: transactions.amount, currency: accounts.currency })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.account_id, accounts.id))
      .where(and(gte(transactions.date, dateFrom), lte(transactions.date, dateTo)));

    const toInrAmt = (amount: number, currency: string | null) =>
      currency && currency !== "INR" ? amount * (rates[currency] ?? 1) : amount;

    const income = rows.filter(r => r.type === "income").reduce((s, r) => s + toInrAmt(r.amount, r.currency), 0);
    const expenses = rows.filter(r => r.type === "expense").reduce((s, r) => s + toInrAmt(r.amount, r.currency), 0);
    results.push({ month, income: Math.round(income), expenses: Math.round(expenses) });
  }

  return results;
}

// ─── Upcoming Premium Payments ────────────────────────────────────────────────

export async function getUpcomingPremiums(daysAhead = 60): Promise<{
  policy_name: string; provider: string; due_date: string; amount: number; frequency: string;
}[]> {
  const db = getDb();
  const allPolicies = await db.select().from(policies);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const upcoming: { policy_name: string; provider: string; due_date: string; amount: number; frequency: string }[] = [];

  for (const p of allPolicies) {
    const monthStep = p.premium_frequency === "monthly" ? 1 : p.premium_frequency === "quarterly" ? 3 : 12;
    const premiumEnd = new Date(p.start_date);
    premiumEnd.setFullYear(premiumEnd.getFullYear() + p.premium_term_years);

    // Walk from start_date forward until we pass today, then collect dates within window
    const cursor = new Date(p.start_date);
    while (cursor <= premiumEnd) {
      if (cursor >= today && cursor <= cutoff) {
        upcoming.push({
          policy_name: p.name,
          provider: p.provider,
          due_date: cursor.toISOString().slice(0, 10),
          amount: p.premium_amount,
          frequency: p.premium_frequency,
        });
      }
      cursor.setMonth(cursor.getMonth() + monthStep);
      if (cursor > cutoff) break;
    }
  }

  return upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10);
}

// ─── Full Dashboard ───────────────────────────────────────────────────────────

export async function getDashboard(month: string): Promise<DashboardResponse> {
  const db = getDb();
  const rates = await getLatestRates();

  const { policy_payouts } = await import("../db/schema");

  const [netWorth, envelopes, allAccounts, allPayouts, allPolicies, upcomingPremiums, carryover] = await Promise.all([
    getNetWorth(),
    listEnvelopes(month),
    db.select().from(accounts),
    db.select().from(policy_payouts),
    db.select().from(policies),
    getUpcomingPremiums(60),
    computeCarryoverForMonth(month, rates),
  ]);

  // Fix: use budgeted_inr for accurate cross-currency total
  const totalBudgeted = envelopes.reduce((s, e) => s + (e.budgeted_inr ?? e.budgeted), 0);
  const totalSpent = envelopes.reduce((s, e) => s + e.spent, 0);

  // Monthly income & expenses from transactions in the selected month
  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const dateTo = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;
  const monthTxns = await db
    .select({ amount: transactions.amount, type: transactions.type, currency: accounts.currency, account_id: transactions.account_id, id: transactions.id, payee: transactions.payee, date: transactions.date })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.account_id, accounts.id))
    .where(and(gte(transactions.date, dateFrom), lte(transactions.date, dateTo)));

  const toInrAmt = (amount: number, currency: string | null) =>
    currency && currency !== "INR" ? amount * (rates[currency] ?? 1) : amount;

  const monthlyIncome = monthTxns
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + toInrAmt(t.amount, t.currency), 0);
  const monthlyExpenses = monthTxns
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + toInrAmt(t.amount, t.currency), 0);

  const savingsRate = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 1000) / 10
    : 0;

  const policiesInr = allPolicies.reduce((s, p) => s + (p.surrender_value ?? p.maturity_value ?? 0), 0);

  // Top transactions this month by INR value (highest first), excluding transfers
  const accountMap = Object.fromEntries(allAccounts.map((a) => [a.id, { name: a.name, currency: a.currency }]));
  const recentTxns = monthTxns
    .filter((t) => t.type !== "transfer")
    .sort((a, b) => toInrAmt(b.amount, accountMap[b.account_id]?.currency ?? null) - toInrAmt(a.amount, accountMap[a.account_id]?.currency ?? null))
    .slice(0, 8);

  // Upcoming policy payouts (next 90 days)
  const today = new Date();
  const in90 = new Date(today);
  in90.setDate(in90.getDate() + 90);
  const policyMap = Object.fromEntries(allPolicies.map((p) => [p.id, p.name]));

  const upcoming = allPayouts
    .filter((po) => {
      const d = new Date(po.payout_date);
      return !po.is_received && d >= today && d <= in90;
    })
    .sort((a, b) => a.payout_date.localeCompare(b.payout_date))
    .slice(0, 5)
    .map((po) => ({
      policy_name: policyMap[po.policy_id] ?? "",
      payout_date: po.payout_date,
      amount: po.amount,
      label: po.label,
    }));

  return {
    net_worth_inr: netWorth.total_inr,
    month,
    budget: {
      total_budgeted: totalBudgeted,
      total_spent: totalSpent,
      total_available: totalBudgeted - totalSpent,
      total_income: monthlyIncome,
      to_assign: monthlyIncome + carryover - totalBudgeted,
    },
    cash_total_inr: netWorth.breakdown.cash_inr,
    investments_total_inr: netWorth.breakdown.investments_inr,
    policies_total_inr: netWorth.breakdown.policies_inr,
    debt_total_inr: netWorth.breakdown.debt_inr,
    monthly_income: monthlyIncome,
    monthly_expenses: monthlyExpenses,
    savings_rate: savingsRate,
    recent_transactions: recentTxns.map((t) => {
      const currency = accountMap[t.account_id]?.currency ?? "INR";
      return {
        id: t.id,
        payee: t.payee,
        amount: t.amount,
        amount_inr: toInrAmt(t.amount, currency),
        currency,
        type: t.type as "income" | "expense" | "transfer",
        date: t.date,
        account_name: accountMap[t.account_id]?.name ?? "",
      };
    }),
    upcoming_policy_payouts: upcoming,
    upcoming_premium_payments: upcomingPremiums,
  };
}
