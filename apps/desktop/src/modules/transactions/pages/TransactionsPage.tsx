import { useState, useCallback } from "react";
import { useAccounts, useTransactions } from "@/modules/budget/hooks/useBudget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filters = {
  account_id?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page: number;
  limit: number;
};

const EMPTY: Filters = { page: 1, limit: 50 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number, type: string) {
  const sign = type === "income" ? "+" : type === "expense" ? "-" : "";
  return `${sign}$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function typeColor(type: string) {
  if (type === "income") return "text-emerald-500";
  if (type === "expense") return "text-red-400";
  return "text-blue-400";
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    income: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    expense: "bg-red-500/10 text-red-400 border-red-500/20",
    transfer: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium capitalize", colors[type] ?? "")}>
      {type}
    </span>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function Filters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { data: accountsData } = useAccounts();

  const accounts = (accountsData as any)?.accounts ?? [];

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch, page: 1 });
  const hasFilters = !!(filters.account_id || filters.type || filters.date_from || filters.date_to || filters.search);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search payee…"
          value={filters.search ?? ""}
          onChange={e => set({ search: e.target.value || undefined })}
          className="pl-8 w-48 h-8 text-sm"
        />
      </div>

      {/* Account */}
      <Select
        value={filters.account_id ?? "all"}
        onValueChange={v => set({ account_id: v === "all" ? undefined : v })}
      >
        <SelectTrigger className="h-8 text-sm w-44">
          <SelectValue placeholder="All Accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          {accounts.map((a: any) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Type */}
      <Select
        value={filters.type ?? "all"}
        onValueChange={v => set({ type: v === "all" ? undefined : v })}
      >
        <SelectTrigger className="h-8 text-sm w-36">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="income">Income</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
          <SelectItem value="transfer">Transfer</SelectItem>
        </SelectContent>
      </Select>

      {/* Date from */}
      <Input
        type="date"
        value={filters.date_from ?? ""}
        onChange={e => set({ date_from: e.target.value || undefined })}
        className="h-8 text-sm w-36"
        placeholder="From"
      />

      {/* Date to */}
      <Input
        type="date"
        value={filters.date_to ?? ""}
        onChange={e => set({ date_to: e.target.value || undefined })}
        className="h-8 text-sm w-36"
        placeholder="To"
      />

      {/* Clear */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground"
          onClick={() => onChange(EMPTY)}
        >
          <X className="w-3.5 h-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const { data, isLoading, isError } = useTransactions(filters as any);
  const txns = (data as any)?.transactions ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const { data: accountsData } = useAccounts();
  const accountMap: Record<string, string> = {};
  for (const a of (accountsData as any)?.accounts ?? []) {
    accountMap[a.id] = a.name;
  }

  const goPage = useCallback(
    (p: number) => setFilters(f => ({ ...f, page: Math.max(1, Math.min(p, totalPages)) })),
    [totalPages]
  );

  const start = (filters.page - 1) * filters.limit + 1;
  const end = Math.min(filters.page * filters.limit, total);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <h1 className="text-xl font-semibold">Transactions</h1>
        {total > 0 && (
          <span className="text-sm text-muted-foreground">{total.toLocaleString()} total</span>
        )}
      </div>

      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-border flex-shrink-0">
        <Filters filters={filters} onChange={setFilters} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Loading…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-40 text-red-400 text-sm">
            Failed to load transactions.
          </div>
        ) : txns.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No transactions found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-6 py-2.5 font-medium w-28">Date</th>
                <th className="px-4 py-2.5 font-medium w-44">Account</th>
                <th className="px-4 py-2.5 font-medium">Payee</th>
                <th className="px-4 py-2.5 font-medium w-36">Category</th>
                <th className="px-4 py-2.5 font-medium w-24">Type</th>
                <th className="px-6 py-2.5 font-medium text-right w-32">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((txn: any, i: number) => (
                <tr
                  key={txn.id}
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                    i % 2 === 0 ? "" : "bg-muted/10"
                  )}
                >
                  <td className="px-6 py-2.5 text-muted-foreground tabular-nums">
                    {txn.date}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-0 w-44">
                    <span className="block truncate">{accountMap[txn.account_id] ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <div className="truncate max-w-xs">{txn.payee}</div>
                    {txn.notes && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{txn.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <span className="truncate block max-w-[9rem]">
                      {txn.envelope_name ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <TypeBadge type={txn.type} />
                  </td>
                  <td className={cn("px-6 py-2.5 text-right font-medium tabular-nums", typeColor(txn.type))}>
                    {fmt(txn.amount, txn.type)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > filters.limit && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border flex-shrink-0 text-sm">
          <span className="text-muted-foreground">
            {start}–{end} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={filters.page <= 1}
              onClick={() => goPage(filters.page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2 text-muted-foreground">
              {filters.page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={filters.page >= totalPages}
              onClick={() => goPage(filters.page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
