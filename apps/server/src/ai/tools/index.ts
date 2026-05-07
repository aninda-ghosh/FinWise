import { listEnvelopes, getMonthlySummary, listTransactions } from "../../services/budget.service";
import { listInvestments, refreshPrice } from "../../services/investment.service";
import { getTimeline } from "../../services/policy.service";
import { getNetWorth } from "../../services/dashboard.service";
import { getLatestRates, refreshFromWeb } from "../../services/exchange-rate.service";
import { TransactionFiltersSchema } from "@finwise/shared/schemas";

// ─── Tool definitions (Ollama tool-calling format) ────────────────────────────

export const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_envelope_summary",
      description: "Get all envelopes for a given month with budgeted, spent, and remaining balance",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "YYYY-MM format, e.g. 2026-04" },
        },
        required: ["month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transactions",
      description: "Get transactions with optional filters. All tool calls are read-only.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Filter by account ID" },
          envelope_id: { type: "string", description: "Filter by envelope ID" },
          date_from: { type: "string", description: "ISO date YYYY-MM-DD" },
          date_to: { type: "string", description: "ISO date YYYY-MM-DD" },
          limit: { type: "number", description: "Max results, default 50" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_investment_summary",
      description: "Get all investments with current value, gain/loss in INR, and asset type",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy_timeline",
      description: "Get upcoming policy maturities, payouts, and premium due dates",
      parameters: {
        type: "object",
        properties: {
          years: { type: "number", description: "How many years ahead to look, default 5" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_net_worth",
      description: "Get total net worth breakdown across accounts, investments, and policies in INR",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_monthly_summary",
      description: "Get income, expenses, and net for a specific month",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "YYYY-MM format" },
        },
        required: ["month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exchange_rates",
      description: "Get the latest exchange rates to INR for all supported currencies",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refresh_investment_price",
      description: "Fetch the current market price for an investment using web search. Use when the user asks about current or live price of an investment.",
      parameters: {
        type: "object",
        properties: {
          investment_id: { type: "string", description: "The ID of the investment to refresh" },
        },
        required: ["investment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refresh_exchange_rates",
      description: "Fetch the latest USD/SGD/NTD to INR exchange rates from the web. Use when the user asks about current exchange rates or currency conversion.",
      parameters: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Specific currency to refresh (USD, SGD, or NTD). Leave empty to refresh all." },
        },
      },
    },
  },
];

// ─── Tool executor — all calls are read-only ──────────────────────────────────

export async function executeTool(
  name: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_envelope_summary": {
      const month = String(params.month ?? new Date().toISOString().slice(0, 7));
      return listEnvelopes(month);
    }

    case "get_transactions": {
      const filters = TransactionFiltersSchema.parse({
        account_id: params.account_id,
        envelope_id: params.envelope_id,
        date_from: params.date_from,
        date_to: params.date_to,
        limit: params.limit ?? 50,
      });
      return listTransactions(filters);
    }

    case "get_investment_summary":
      return listInvestments();

    case "get_policy_timeline": {
      const years = Number(params.years ?? 5);
      return getTimeline(years);
    }

    case "get_net_worth":
      return getNetWorth();

    case "get_monthly_summary": {
      const month = String(params.month ?? new Date().toISOString().slice(0, 7));
      return getMonthlySummary(month);
    }

    case "get_exchange_rates":
      return getLatestRates();

    case "refresh_investment_price": {
      const investment_id = String(params.investment_id ?? "");
      if (!investment_id) throw new Error("investment_id is required");
      return refreshPrice(investment_id);
    }

    case "refresh_exchange_rates": {
      const currency = params.currency ? String(params.currency) : undefined;
      return refreshFromWeb(currency);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
