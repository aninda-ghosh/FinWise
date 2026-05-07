import { apiFetch } from "@/lib/api";
export const dashboardApi = {
  getDashboard: (month: string) => apiFetch<any>(`/api/dashboard?month=${month}`),
  getNetWorth: () => apiFetch<any>(`/api/dashboard/net-worth`),
  getPortfolioBreakdown: () => apiFetch<any>(`/api/dashboard/portfolio-breakdown`),
  getTopMovers: (limit = 5) => apiFetch<any>(`/api/dashboard/top-movers?limit=${limit}`),
  getSpendingTrends: (months = 6) => apiFetch<{ trends: { month: string; income: number; expenses: number }[] }>(`/api/dashboard/spending-trends?months=${months}`),
};
