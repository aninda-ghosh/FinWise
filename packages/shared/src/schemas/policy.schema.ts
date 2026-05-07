import { z } from "zod";

export const PremiumFrequencyEnum = z.enum(["monthly", "quarterly", "annual"]);

export const CreatePolicySchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  policy_number: z.string().optional(),
  start_date: z.string().date("Date must be ISO format YYYY-MM-DD"),
  premium_amount: z.number().positive(),
  premium_frequency: PremiumFrequencyEnum,
  premium_term_years: z.number().int().positive(),
  policy_term_years: z.number().int().positive(),
  maturity_date: z.string().date(),
  sum_assured: z.number().positive(),
  maturity_value: z.number().positive(),
  surrender_value: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const UpdatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  premium_amount: z.number().positive().optional(),
  surrender_value: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const CreatePayoutSchema = z.object({
  payout_date: z.string().date(),
  amount: z.number().positive(),
  label: z.string().min(1),
  is_received: z.boolean().default(false),
});

export const UpdatePayoutSchema = z.object({
  is_received: z.boolean().optional(),
  amount: z.number().positive().optional(),
  label: z.string().min(1).optional(),
});
