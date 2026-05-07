import { z } from "zod";
import {
  CreatePayoutSchema,
  CreatePolicySchema,
  UpdatePayoutSchema,
  UpdatePolicySchema,
} from "../schemas/policy.schema";

export type CreatePolicyRequest = z.infer<typeof CreatePolicySchema>;
export type UpdatePolicyRequest = z.infer<typeof UpdatePolicySchema>;
export type CreatePayoutRequest = z.infer<typeof CreatePayoutSchema>;
export type UpdatePayoutRequest = z.infer<typeof UpdatePayoutSchema>;

export type PayoutResponse = {
  id: string;
  policy_id: string;
  payout_date: string;
  amount: number;
  label: string;
  is_received: boolean;
};

export type PolicyResponse = {
  id: string;
  name: string;
  provider: string;
  policy_number: string | null;
  start_date: string;
  premium_amount: number;
  premium_frequency: "monthly" | "quarterly" | "annual";
  premium_term_years: number;
  policy_term_years: number;
  maturity_date: string;
  sum_assured: number;
  maturity_value: number;
  surrender_value: number | null;
  total_invested: number;
  notes: string | null;
  payouts: PayoutResponse[];
  created_at: string;
  updated_at: string;
};

export type PolicyListResponse = { policies: PolicyResponse[] };
