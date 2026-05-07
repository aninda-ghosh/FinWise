import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { convertFromINR, formatCurrency } from "@finwise/shared/utils";
import { useAppStore } from "@/stores/app.store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Target, Wallet,
  Building2, BarChart3, ShieldCheck, CalendarDays, DollarSign,
} from "lucide-react";
import { useDashboard, useNetWorth, usePortfolioBreakdown, useTopMovers, useSpendingTrends } from "../hooks/useDashboard";
import { useExchangeRates } from "@/modules/budget/hooks/useBudget";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

// ─── Tiny stat widget ─────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon: Icon, accent = "default", loading = false,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType;
  accent?: "default" | "green" | "red" | "blue" | "purple" | "amber";
  loading?: boolean;
}) {
  const colors: Record<string, string> = {
    default:  "text-foreground bg-muted/60",
    green:    "text-green-600 dark:text-green-400 bg-green-500/10",
    red:      "text-red-500 bg-red-500/10",
    blue:     "text-blue-500 bg-blue-500/10",
    purple:   "text-indigo-500 bg-indigo-500/10",
    amber:    "text-amber-500 bg-amber-500/10",
  };
  return (
    <Card className="flex flex-col justify-between">
      <CardContent className="pt-3 pb-3 flex flex-col gap-1 h-full">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <div className={`p-1.5 rounded-lg ${colors[accent]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>
        {loading
          ? <><Skeleton className="h-6 w-28 mt-1" /><Skeleton className="h-3 w-20 mt-1" /></>
          : <>
              <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
              {sub && <p className="text-[11px] text-muted-foreground leading-snug">{sub}</p>}
            </>
        }
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { selectedMonth, defaultCurrency } = useAppStore();
  const { data: dashboard, isLoading: dashLoading } = useDashboard(selectedMonth);
  const { data: netWorth, isLoading: nwLoading } = useNetWorth();
  const { data: breakdown } = usePortfolioBreakdown();
  const { data: topMovers } = useTopMovers();
  const { data: trendsData } = useSpendingTrends(6);
  const { data: rates = {} } = useExchangeRates();

  const fmt = (inr: number) =>
    formatCurrency(convertFromINR(inr, defaultCurrency as any, rates), defaultCurrency as any);

  const donutData = breakdown?.breakdown?.map((b: any) => ({
    name: b.asset_type.replace(/_/g, " "),
    value: b.value_inr,
    pct: b.percentage,
  })) ?? [];

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleString("default", { month: "long", year: "numeric" });
  })();

  const nw       = netWorth?.total_inr ?? 0;
  const accts    = netWorth?.breakdown?.cash_inr ?? 0;
  const invs     = netWorth?.breakdown?.investments_inr ?? 0;
  const pols     = netWorth?.breakdown?.policies_inr ?? 0;
  const debt     = netWorth?.breakdown?.debt_inr ?? 0;
  const income   = dashboard?.monthly_income ?? 0;
  const expenses = dashboard?.monthly_expenses ?? 0;
  const savings  = dashboard?.savings_rate ?? 0;
  const toAssign = dashboard?.budget?.to_assign ?? 0;
  const budgeted = dashboard?.budget?.total_budgeted ?? 0;
  const spent    = dashboard?.budget?.total_spent ?? 0;

  return (
    <div className="p-4 space-y-3">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1.5 font-semibold">
            <DollarSign className="w-3 h-3" />{defaultCurrency}
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5">
            <CalendarDays className="w-3 h-3" />{monthLabel}
          </Badge>
        </div>
      </div>

      {/* ── Row 1: Net Worth hero ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-6">
            {/* Left: headline */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Total Net Worth</p>
              {nwLoading
                ? <Skeleton className="h-9 w-44" />
                : <p className="text-3xl font-bold tabular-nums">{fmt(nw)}</p>
              }
              {/* Breakdown bar */}
              {!nwLoading && (accts + invs + pols) > 0 && (
                <div className="flex h-1 rounded-full overflow-hidden w-56 mt-2 gap-px">
                  {(() => {
                    const total = accts + invs + pols;
                    return (
                      <>
                        <div className="bg-indigo-500 rounded-l-full" style={{ width: `${(accts / total) * 100}%` }} />
                        <div className="bg-emerald-500" style={{ width: `${(invs / total) * 100}%` }} />
                        <div className="bg-amber-500" style={{ width: `${(pols / total) * 100}%` }} />
                        {debt > 0 && <div className="bg-red-500 rounded-r-full" style={{ width: `${(debt / total) * 100}%` }} />}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            {/* Right: breakdown pills */}
            <div className="flex gap-5 flex-shrink-0 flex-wrap justify-end">
              {[
                { label: "Cash & Accounts", value: accts,  dot: "bg-indigo-500" },
                { label: "Investments",      value: invs,   dot: "bg-emerald-500" },
                { label: "Policies / Bonds", value: pols,   dot: "bg-amber-500" },
                ...(debt > 0 ? [{ label: "Debt", value: -debt, dot: "bg-red-500" }] : []),
              ].map(s => (
                <div key={s.label} className="text-right">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />{s.label}
                  </p>
                  {nwLoading
                    ? <Skeleton className="h-5 w-20 mt-0.5" />
                    : <p className={`text-base font-semibold tabular-nums ${s.value < 0 ? "text-red-500" : ""}`}>
                        {s.value < 0 ? "−" : ""}{fmt(Math.abs(s.value))}
                      </p>
                  }
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 2: Wealth breakdown ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="Cash & Accounts" value={fmt(accts)} sub="On-budget balances"
          icon={Building2} accent="purple" loading={nwLoading} />
        <StatCard title="Investments" value={fmt(invs)} sub="Portfolio + linked accounts"
          icon={TrendingUp} accent="green" loading={nwLoading} />
        <StatCard title="Policies / Bonds" value={fmt(pols)} sub="Surrender / maturity value"
          icon={ShieldCheck} accent="amber" loading={nwLoading} />
        <StatCard title="Total Debt" value={debt > 0 ? `−${fmt(debt)}` : fmt(0)} sub="Loans & credit owed"
          icon={BarChart3} accent="blue" loading={nwLoading} />
      </div>

      {/* ── Row 3: Month KPIs ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard title="Income" value={fmt(income)} sub={monthLabel}
          icon={TrendingUp} accent="green" loading={dashLoading} />
        <StatCard title="Expenses" value={fmt(expenses)} sub={expenses > 0 ? `${savings.toFixed(1)}% saved` : "No expenses"}
          icon={TrendingDown} accent="red" loading={dashLoading} />
        <StatCard
          title="Savings Rate"
          value={`${savings.toFixed(1)}%`}
          sub={savings >= 20 ? "Above 20% goal ✓" : income > 0 ? "Below 20% goal" : "No income this month"}
          icon={Wallet}
          accent={income === 0 ? "default" : savings >= 20 ? "green" : "red"}
          loading={dashLoading}
        />
        <StatCard
          title="Ready to Assign"
          value={fmt(Math.abs(toAssign))}
          sub={toAssign > 0 ? "Unassigned income" : toAssign < 0 ? "Over-budgeted" : "Fully assigned"}
          icon={Target}
          accent={toAssign > 0 ? "green" : toAssign < 0 ? "red" : "default"}
          loading={dashLoading}
        />
      </div>

      {/* ── Row 4: Portfolio + Budget progress + Recent transactions ─── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Portfolio Breakdown ── 4 cols */}
        <Card className="col-span-4">
          <CardHeader className="pt-3 pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portfolio Breakdown</CardTitle></CardHeader>
          <CardContent className="pb-3">
            {donutData.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-6">No investments yet.</p>
              : (
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width={100} height={100}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={46}>
                        {donutData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 flex-1 min-w-0">
                    {donutData.map((d: any, i: number) => (
                      <div key={d.name} className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-[11px] text-muted-foreground capitalize flex-1 truncate">{d.name}</span>
                        <span className="text-[11px] font-semibold tabular-nums">{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Budget progress ── 4 cols */}
        <Card className="col-span-4">
          <CardHeader className="pt-3 pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget — {monthLabel}</CardTitle></CardHeader>
          <CardContent className="pb-3 space-y-2">
            {dashLoading
              ? <Skeleton className="h-20 w-full" />
              : <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-500/10 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Income</p>
                      <p className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums truncate">{fmt(income)}</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Expenses</p>
                      <p className="text-sm font-bold text-red-500 tabular-nums truncate">{fmt(expenses)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Envelope spend</span>
                      <span className="tabular-nums">{fmt(spent)} / {fmt(budgeted)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${spent > budgeted ? "bg-red-500" : "bg-indigo-500"}`}
                        style={{ width: `${Math.min(100, budgeted > 0 ? (spent / budgeted) * 100 : 0)}%` }}
                      />
                    </div>
                    <p className={`text-[11px] mt-1 tabular-nums ${toAssign >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {toAssign >= 0 ? `${fmt(toAssign)} ready to assign` : `${fmt(-toAssign)} over-budgeted`}
                    </p>
                  </div>
                </>
            }
          </CardContent>
        </Card>

        {/* Recent Transactions ── 4 cols */}
        <Card className="col-span-4">
          <CardHeader className="pt-3 pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Transactions — {monthLabel}</CardTitle></CardHeader>
          <CardContent className="pb-3">
            {dashLoading
              ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              : !dashboard?.recent_transactions?.length
              ? <p className="text-xs text-muted-foreground text-center py-6">No transactions this month.</p>
              : (
                <div className="space-y-0">
                  {dashboard.recent_transactions.slice(0, 6).map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between py-1 rounded hover:bg-muted/40 px-1 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{t.payee}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{t.date} · {t.account_name}</p>
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ml-2 flex-shrink-0 ${t.type === "income" ? "text-green-600 dark:text-green-400" : t.type === "expense" ? "text-red-500" : "text-blue-500"}`}>
                        {t.type === "income" ? "+" : t.type === "expense" ? "−" : "⇄"}{fmt(t.amount_inr ?? t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

      </div>

      {/* ── Row 5: Spending Trends ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pt-3 pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income vs Expenses — Last 6 Months</CardTitle></CardHeader>
        <CardContent className="pb-3">
          {!trendsData?.trends?.length
            ? <p className="text-xs text-muted-foreground text-center py-6">No transaction data yet.</p>
            : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={trendsData.trends} barSize={18} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={m => { const [y, mo] = m.split("-"); return new Date(+y, +mo - 1).toLocaleString("default", { month: "short" }); }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} width={70} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={m => { const [y, mo] = m.split("-"); return new Date(+y, +mo - 1).toLocaleString("default", { month: "long", year: "numeric" }); }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name="Income" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </CardContent>
      </Card>

      {/* ── Row 6: Investment Movers + Upcoming Payouts + Upcoming Premiums ── */}
      <div className="grid grid-cols-3 gap-3">

        {/* Investment Movers */}
        <Card>
          <CardHeader className="pt-3 pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Investment Movers</CardTitle></CardHeader>
          <CardContent className="pb-3">
            {!topMovers?.movers?.length
              ? <p className="text-xs text-muted-foreground text-center py-4">No investments yet.</p>
              : (
                <div className="space-y-0">
                  {topMovers.movers.map((m: any) => {
                    const pos = m.gain_loss_inr >= 0;
                    return (
                      <div key={m.investment.id} className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{m.investment.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{m.investment.asset_type.replace(/_/g, " ")}</p>
                        </div>
                        <div className={`text-right ml-3 ${pos ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                          <p className="text-xs font-semibold tabular-nums">{pos ? "+" : ""}{fmt(m.gain_loss_inr)}</p>
                          <p className="text-[10px]">{pos ? "+" : ""}{m.gain_loss_pct.toFixed(2)}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Upcoming Policy Payouts */}
        <Card>
          <CardHeader className="pt-3 pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scheduled Policy Receipts — next 90 days</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Upcoming maturity/bonus amounts from your insurance &amp; bond policies</p>
          </CardHeader>
          <CardContent className="pb-3">
            {!dashboard?.upcoming_policy_payouts?.length
              ? <p className="text-xs text-muted-foreground text-center py-4">No scheduled receipts in the next 90 days.</p>
              : (
                <div className="space-y-1.5">
                  {dashboard.upcoming_policy_payouts.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div>
                        <p className="text-xs font-medium">{p.policy_name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.payout_date} · {p.label}</p>
                      </div>
                      <p className="text-xs font-bold text-green-600 dark:text-green-400 tabular-nums">{fmt(p.amount)}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

        {/* Upcoming Premium Payments */}
        <Card>
          <CardHeader className="pt-3 pb-1">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Premiums — next 60 days</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">Insurance premium payments due soon</p>
          </CardHeader>
          <CardContent className="pb-3">
            {!dashboard?.upcoming_premium_payments?.length
              ? <p className="text-xs text-muted-foreground text-center py-4">No premiums due in the next 60 days.</p>
              : (
                <div className="space-y-1.5">
                  {dashboard.upcoming_premium_payments.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10">
                      <div>
                        <p className="text-xs font-medium">{p.policy_name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.due_date} · {p.provider} · {p.frequency}</p>
                      </div>
                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">−{fmt(p.amount)}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
