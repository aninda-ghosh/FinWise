import { eq } from "drizzle-orm";
import type {
  CreatePayoutRequest,
  CreatePolicyRequest,
  PayoutResponse,
  PolicyResponse,
  UpdatePayoutRequest,
  UpdatePolicyRequest,
} from "@finwise/shared/api-contracts";
import { getDb } from "../db/index";
import { policies, policy_payouts } from "../db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPayoutResponse(row: typeof policy_payouts.$inferSelect): PayoutResponse {
  return {
    id: row.id,
    policy_id: row.policy_id,
    payout_date: row.payout_date,
    amount: row.amount,
    label: row.label,
    is_received: row.is_received ?? false,
  };
}

function computeTotalInvested(policy: typeof policies.$inferSelect): number {
  const freq = policy.premium_frequency;
  const paymentsPerYear = freq === "monthly" ? 12 : freq === "quarterly" ? 4 : 1;
  return policy.premium_amount * paymentsPerYear * policy.premium_term_years;
}

async function toPolicyResponse(
  row: typeof policies.$inferSelect
): Promise<PolicyResponse> {
  const db = getDb();
  const payoutRows = await db
    .select()
    .from(policy_payouts)
    .where(eq(policy_payouts.policy_id, row.id))
    .orderBy(policy_payouts.payout_date);

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    policy_number: row.policy_number ?? null,
    start_date: row.start_date,
    premium_amount: row.premium_amount,
    premium_frequency: row.premium_frequency as PolicyResponse["premium_frequency"],
    premium_term_years: row.premium_term_years,
    policy_term_years: row.policy_term_years,
    maturity_date: row.maturity_date,
    sum_assured: row.sum_assured,
    maturity_value: row.maturity_value,
    surrender_value: row.surrender_value ?? null,
    total_invested: computeTotalInvested(row),
    notes: row.notes ?? null,
    payouts: payoutRows.map(toPayoutResponse),
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

// ─── Compute next premium due dates ──────────────────────────────────────────

function getNextPremiumDate(policy: typeof policies.$inferSelect): Date | null {
  const start = new Date(policy.start_date);
  const today = new Date();
  const endOfPremiumTerm = new Date(start);
  endOfPremiumTerm.setFullYear(endOfPremiumTerm.getFullYear() + policy.premium_term_years);
  if (today >= endOfPremiumTerm) return null;

  const freq = policy.premium_frequency;
  const monthsInterval = freq === "monthly" ? 1 : freq === "quarterly" ? 3 : 12;

  let next = new Date(start);
  while (next <= today) {
    next.setMonth(next.getMonth() + monthsInterval);
  }
  return next;
}

// ─── Service methods ──────────────────────────────────────────────────────────

export async function listPolicies(): Promise<PolicyResponse[]> {
  const db = getDb();
  const rows = await db.select().from(policies).orderBy(policies.name);
  return Promise.all(rows.map(toPolicyResponse));
}

export async function createPolicy(data: CreatePolicyRequest): Promise<PolicyResponse> {
  const db = getDb();
  const [row] = await db.insert(policies).values(data).returning();
  return toPolicyResponse(row);
}

export async function updatePolicy(
  id: string,
  data: UpdatePolicyRequest
): Promise<PolicyResponse> {
  const db = getDb();
  const [row] = await db
    .update(policies)
    .set({ ...data, updated_at: new Date().toISOString() })
    .where(eq(policies.id, id))
    .returning();
  if (!row) throw Object.assign(new Error("Policy not found"), { status: 404 });
  return toPolicyResponse(row);
}

export async function generatePayouts(
  policyId: string,
  opts: { start_date: string; end_date: string; amount: number; frequency: "monthly" | "quarterly" | "annual"; label: string }
): Promise<number> {
  const db = getDb();
  // Verify policy exists
  const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
  if (!policy) throw Object.assign(new Error("Policy not found"), { status: 404 });

  const monthsStep = opts.frequency === "monthly" ? 1 : opts.frequency === "quarterly" ? 3 : 12;
  const dates: string[] = [];
  const cursor = new Date(opts.start_date);
  const end = new Date(opts.end_date);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setMonth(cursor.getMonth() + monthsStep);
  }

  if (dates.length === 0) return 0;

  await db.insert(policy_payouts).values(
    dates.map((d) => ({ policy_id: policyId, payout_date: d, amount: opts.amount, label: opts.label, is_received: false }))
  );
  return dates.length;
}

export async function deletePolicy(id: string): Promise<void> {
  const db = getDb();
  await db.delete(policy_payouts).where(eq(policy_payouts.policy_id, id));
  const [row] = await db.delete(policies).where(eq(policies.id, id)).returning();
  if (!row) throw Object.assign(new Error("Policy not found"), { status: 404 });
}

export async function getPayouts(policyId: string): Promise<PayoutResponse[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(policy_payouts)
    .where(eq(policy_payouts.policy_id, policyId))
    .orderBy(policy_payouts.payout_date);
  return rows.map(toPayoutResponse);
}

export async function addPayout(
  policyId: string,
  data: CreatePayoutRequest
): Promise<PayoutResponse> {
  const db = getDb();
  const [row] = await db
    .insert(policy_payouts)
    .values({ ...data, policy_id: policyId })
    .returning();
  return toPayoutResponse(row);
}

export async function markPayoutReceived(
  policyId: string,
  payoutId: string
): Promise<PayoutResponse> {
  const db = getDb();
  const [row] = await db
    .update(policy_payouts)
    .set({ is_received: true })
    .where(eq(policy_payouts.id, payoutId))
    .returning();
  if (!row || row.policy_id !== policyId) {
    throw Object.assign(new Error("Payout not found"), { status: 404 });
  }
  return toPayoutResponse(row);
}

export async function updatePayout(
  policyId: string,
  payoutId: string,
  data: UpdatePayoutRequest
): Promise<PayoutResponse> {
  const db = getDb();
  const [row] = await db
    .update(policy_payouts)
    .set(data)
    .where(eq(policy_payouts.id, payoutId))
    .returning();
  if (!row || row.policy_id !== policyId) {
    throw Object.assign(new Error("Payout not found"), { status: 404 });
  }
  return toPayoutResponse(row);
}

export type TimelineEvent = {
  type: "maturity" | "payout" | "premium_due";
  date: string;
  policy_id: string;
  policy_name: string;
  amount: number;
  label: string;
};

export async function getTimeline(years: number): Promise<TimelineEvent[]> {
  const db = getDb();
  const allPolicies = await db.select().from(policies);
  const allPayouts = await db.select().from(policy_payouts);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() + years);
  const events: TimelineEvent[] = [];

  for (const p of allPolicies) {
    // Maturity event
    const maturity = new Date(p.maturity_date);
    if (maturity <= cutoff) {
      events.push({
        type: "maturity",
        date: p.maturity_date,
        policy_id: p.id,
        policy_name: p.name,
        amount: p.maturity_value,
        label: "Policy Maturity",
      });
    }

    // Premium due events
    const next = getNextPremiumDate(p);
    if (next && next <= cutoff) {
      events.push({
        type: "premium_due",
        date: next.toISOString().slice(0, 10),
        policy_id: p.id,
        policy_name: p.name,
        amount: p.premium_amount,
        label: `${p.premium_frequency} premium`,
      });
    }
  }

  // Payout events
  for (const po of allPayouts) {
    const payoutDate = new Date(po.payout_date);
    if (payoutDate <= cutoff) {
      const policy = allPolicies.find((p) => p.id === po.policy_id);
      events.push({
        type: "payout",
        date: po.payout_date,
        policy_id: po.policy_id,
        policy_name: policy?.name ?? "",
        amount: po.amount,
        label: po.label,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export type PolicyAlert = {
  policy_id: string;
  policy_name: string;
  next_premium_date: string;
  premium_amount: number;
  days_until_due: number;
};

export async function getUpcomingAlerts(days: number): Promise<PolicyAlert[]> {
  const db = getDb();
  const allPolicies = await db.select().from(policies);
  const today = new Date();
  const alerts: PolicyAlert[] = [];

  for (const p of allPolicies) {
    const next = getNextPremiumDate(p);
    if (!next) continue;
    const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= days) {
      alerts.push({
        policy_id: p.id,
        policy_name: p.name,
        next_premium_date: next.toISOString().slice(0, 10),
        premium_amount: p.premium_amount,
        days_until_due: daysUntil,
      });
    }
  }

  return alerts.sort((a, b) => a.days_until_due - b.days_until_due);
}
