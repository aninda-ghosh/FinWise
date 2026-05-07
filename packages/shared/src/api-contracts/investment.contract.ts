import { z } from "zod";
import {
  CreateInvestmentSchema,
  UpdateInvestmentSchema,
} from "../schemas/investment.schema";

export type CreateInvestmentRequest = z.infer<typeof CreateInvestmentSchema>;
export type UpdateInvestmentRequest = z.infer<typeof UpdateInvestmentSchema>;

export type InvestmentResponse = {
  id: string;
  name: string;
  asset_type: "mutual_fund" | "fd" | "savings" | "bond" | "real_estate" | "cash" | "structured" | "other";
  currency: "INR" | "USD" | "SGD" | "GBP" | "EUR" | "AUD" | "JPY" | "TWD" | "HKD" | "CAD" | "NTD";
  purchase_value: number;
  purchase_value_inr: number;
  units: number | null;
  purchase_date: string;
  current_value: number;
  current_value_inr: number;
  gain_loss_inr: number;
  gain_loss_pct: number;
  current_value_source: string | null;
  current_value_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentListResponse = { investments: InvestmentResponse[] };

export type PriceHistoryEntry = {
  id: string;
  price: number;
  source_url: string | null;
  fetched_at: string;
};

export type PriceHistoryResponse = { history: PriceHistoryEntry[] };
