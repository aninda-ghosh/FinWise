import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { investmentsApi } from "../api";

export function useInvestments(filters?: { asset_type?: string }) {
  return useQuery({ queryKey: ["investments", filters], queryFn: () => investmentsApi.getInvestments(filters) });
}

export function usePortfolioSummary() {
  return useQuery({ queryKey: ["portfolio-summary"], queryFn: investmentsApi.getPortfolioSummary });
}

export function useCreateInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investmentsApi.createInvestment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investments"] }); qc.invalidateQueries({ queryKey: ["portfolio-summary"] }); },
  });
}

export function useRefreshPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investmentsApi.refreshPrice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
}

export function useUpdateInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => investmentsApi.updateInvestment(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investments"] }); qc.invalidateQueries({ queryKey: ["portfolio-summary"] }); },
  });
}

export function useDeleteInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investmentsApi.deleteInvestment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
}
