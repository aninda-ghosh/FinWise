import { useState } from "react";
import { useAppStore } from "@/stores/app.store";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { formatINR, formatCurrency, convertFromINR } from "@finwise/shared/utils";
import { SUPPORTED_CURRENCIES, type Currency } from "@finwise/shared/schemas";
import { useExchangeRates } from "@/modules/budget/hooks/useBudget";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Pencil, PlusCircle, RefreshCw, Trash2 } from "lucide-react";
import { useCreateInvestment, useDeleteInvestment, useInvestments, usePortfolioSummary, useRefreshPrice, useUpdateInvestment } from "../hooks/useInvestments";
import { useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, useTransactions, useDeleteTransaction, useCreateTransaction, useCreateTransfer, useEnvelopes } from "@/modules/budget/hooks/useBudget";
import type { InvestmentResponse } from "@finwise/shared/api-contracts";

const COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899"];
const ASSET_TYPES = ["mutual_fund","stock","etf","fd","savings","bond","real_estate","cash","structured","other"];
const ASSET_LABELS: Record<string, string> = {
  mutual_fund: "Mutual Fund", stock: "Stock", etf: "ETF", fd: "FD", savings: "Savings Account",
  bond: "Bond", real_estate: "Real Estate", cash: "Cash", structured: "Structured", other: "Other",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MoneyCell({ native, nativeCurrency, inr }: { native: number; nativeCurrency: string; inr: number }) {
  const isINR = nativeCurrency === "INR";
  return (
    <div className="text-right">
      <div className="font-medium tabular-nums">
        {formatCurrency(native, nativeCurrency as any)}
      </div>
      {!isINR && (
        <div className="text-xs text-muted-foreground tabular-nums">≈ {formatINR(inr)}</div>
      )}
    </div>
  );
}

function GainLossCell({ inv, fmt }: { inv: InvestmentResponse; fmt: (inr: number) => string }) {
  const pos = inv.gain_loss_inr >= 0;
  const pct = inv.gain_loss_pct;
  return (
    <div className={`text-right font-medium tabular-nums ${pos ? "text-green-600" : "text-red-500"}`}>
      <div>{pos ? "+" : ""}{fmt(inv.gain_loss_inr)}</div>
      <div className="text-xs opacity-80">{pos ? "+" : ""}{pct.toFixed(2)}%</div>
    </div>
  );
}

// ─── Linked Account Transactions Sheet ───────────────────────────────────────

function LinkedAccountSheet({ account, open, onOpenChange, allAccounts }: {
  account: any; open: boolean; onOpenChange: (v: boolean) => void; allAccounts: any[];
}) {
  const { data } = useTransactions({ account_id: account.id, limit: 200 });
  const { mutate: deleteTxn } = useDeleteTransaction();
  const { mutate: createTxn, isPending: creating } = useCreateTransaction();
  const { mutate: createTransfer, isPending: transferring } = useCreateTransfer();
  const { defaultCurrency, selectedMonth } = useAppStore();
  const { data: rates = {} } = useExchangeRates();
  const { data: envelopesData } = useEnvelopes(selectedMonth);

  const txns = data?.transactions ?? [];
  const showHint = account.currency !== defaultCurrency;
  const fmtDefault = (inr: number) =>
    formatCurrency(convertFromINR(inr, defaultCurrency as any, rates), defaultCurrency as any);

  const allEnvelopes = (envelopesData as any)?.envelopes ?? [];
  const envelopesByGroup = (allEnvelopes as any[]).reduce<{ groupId: string; groupName: string; items: any[] }[]>(
    (acc, env: any) => {
      const existing = acc.find(g => g.groupId === env.group_id);
      if (existing) existing.items.push(env);
      else acc.push({ groupId: env.group_id, groupName: env.group_name ?? "Other", items: [env] });
      return acc;
    }, []
  );

  const [tab, setTab] = useState<"income" | "expense" | "transfer">("income");
  const [transferDir, setTransferDir] = useState<"out" | "in">("out");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [envelope, setEnvelope] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const resetForm = () => {
    setPayee(""); setAmount(""); setToAccount(""); setToAmount(""); setEnvelope("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const otherAcc = allAccounts.find((a: any) => a.id === toAccount);
  const sameCurrency = otherAcc?.currency === account.currency;

  const submitTxn = () => {
    if (tab === "transfer") {
      if (!toAccount || !amount) return;
      const fromId = transferDir === "out" ? account.id : toAccount;
      const toId = transferDir === "out" ? toAccount : account.id;
      const fromAmt = parseFloat(amount);
      const toAmt = sameCurrency ? fromAmt : parseFloat(toAmount || amount);
      createTransfer(
        {
          from_account_id: fromId,
          to_account_id: toId,
          amount: fromAmt,
          to_amount: toAmt,
          date,
          notes: payee || undefined,
          envelope_id: envelope || undefined,
        },
        { onSuccess: () => { toast.success("Transfer recorded"); resetForm(); }, onError: e => toast.error(e.message) }
      );
    } else {
      if (!payee.trim() || !amount) return;
      createTxn(
        { account_id: account.id, payee: payee.trim(), amount: parseFloat(amount), type: tab, date },
        { onSuccess: () => { toast.success("Transaction added"); resetForm(); }, onError: e => toast.error(e.message) }
      );
    }
  };

  const sel = "w-full border rounded-md px-2 py-1 text-sm mt-1 h-8 bg-background";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[640px] sm:max-w-none flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0 pr-14">
          <SheetTitle className="text-lg">{account.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Balance:{" "}
            <span className="font-semibold text-foreground">{formatCurrency(account.balance, account.currency)}</span>
            {showHint && <span className="ml-1.5 text-xs">≈ {fmtDefault(account.balance_inr)}</span>}
            <span className="ml-2 text-xs bg-muted rounded px-1.5 py-0.5">{account.currency}</span>
          </p>
        </SheetHeader>

        {/* Add transaction */}
        <div className="px-6 py-4 border-b flex-shrink-0 bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">New Transaction</p>
          <div className="flex rounded-lg border overflow-hidden text-sm mb-3">
            {(["income", "expense", "transfer"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); resetForm(); }}
                className={`flex-1 py-1.5 capitalize font-medium transition-colors ${tab === t ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "transfer" ? (
            <div className="space-y-2">
              <div className="flex rounded-md border overflow-hidden text-xs mb-1">
                <button onClick={() => { setTransferDir("out"); setToAccount(""); setToAmount(""); }}
                  className={`flex-1 py-1 font-medium transition-colors ${transferDir === "out" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}>
                  Send from {account.name}
                </button>
                <button onClick={() => { setTransferDir("in"); setToAccount(""); setToAmount(""); }}
                  className={`flex-1 py-1 font-medium transition-colors ${transferDir === "in" ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}>
                  Deposit into {account.name}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{transferDir === "out" ? "To account" : "From account"}</Label>
                  <select value={toAccount} onChange={e => { setToAccount(e.target.value); setToAmount(""); }} className={sel}>
                    <option value="">Select account</option>
                    {allAccounts.filter((a: any) => a.id !== account.id).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Amount ({account.currency})</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1 h-8 text-sm" />
                </div>
              </div>
              {!sameCurrency && otherAcc && (
                <div>
                  <Label className="text-xs">{transferDir === "out" ? `Received (${otherAcc.currency})` : `Deducted (${otherAcc.currency})`}</Label>
                  <Input type="number" value={toAmount} onChange={e => setToAmount(e.target.value)} placeholder="0.00" className="mt-1 h-8 text-sm" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Monthly transfer" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                {envelopesByGroup.length > 0 && (
                  <div className="col-span-2">
                    <Label className="text-xs">Category <span className="text-muted-foreground">(optional)</span></Label>
                    <select value={envelope} onChange={e => setEnvelope(e.target.value)} className={`${sel} col-span-2`}>
                      <option value="">None</option>
                      {envelopesByGroup.map(({ groupId, groupName, items }) => (
                        <optgroup key={groupId} label={groupName}>
                          {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <Button className="w-full h-8 text-sm" onClick={submitTxn}
                disabled={transferring || !toAccount || !amount || (!sameCurrency && !toAmount && !!otherAcc)}>
                <PlusCircle className="w-3.5 h-3.5 mr-1.5" />Record transfer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Payee</Label>
                <Input value={payee} onChange={e => setPayee(e.target.value)}
                  placeholder={tab === "income" ? "e.g. Interest" : "e.g. Fee"}
                  className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Amount ({account.currency})</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
            </div>
          )}

          {tab !== "transfer" && (
            <Button className="w-full mt-3 h-8 text-sm" onClick={submitTxn}
              disabled={creating || !payee.trim() || !amount}>
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />Add {tab}
            </Button>
          )}
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto">
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No transactions for this account yet.</p>
          ) : (
            <div className="divide-y">
              {txns.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 group/row transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.payee}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.date}
                      {t.type === "transfer" && <span className="ml-1.5 text-blue-500">· transfer</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${t.type === "income" ? "text-green-600 dark:text-green-400" : t.type === "expense" ? "text-red-500" : "text-blue-500"}`}>
                        {t.type === "income" ? "+" : t.type === "expense" ? "−" : "⇄"}{formatCurrency(t.amount, account.currency)}
                      </p>
                      {showHint && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          ≈ {fmtDefault(t.amount * (rates[account.currency] ?? 1))}
                        </p>
                      )}
                    </div>
                    <button
                      className="opacity-0 group-hover/row:opacity-100 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-opacity"
                      onClick={() => deleteTxn(t.id, { onSuccess: () => toast.success("Deleted") })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Linked Account Edit Dialog ───────────────────────────────────────────────

const ACCOUNT_TYPES = ["checking", "savings", "credit", "investment", "cash"];

function LinkedAccountEditDialog({ account, trigger }: { account: any; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const { mutate: update, isPending } = useUpdateAccount();

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  const submit = () => {
    if (!name.trim()) return;
    update(
      { id: account.id, data: { name: name.trim(), type, currency } },
      {
        onSuccess: () => { toast.success("Account updated"); setOpen(false); },
        onError: e => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) { setName(account.name); setType(account.type); setCurrency(account.currency); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select value={type} onChange={e => setType(e.target.value)} className={sel}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Currency</Label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={sel}>
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={isPending || !name.trim()}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Linked Account Dialog ────────────────────────────────────────────────

type LinkedAccountType = "savings" | "investment";

function AddLinkedAccountDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<LinkedAccountType>("savings");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [balance, setBalance] = useState("");
  const { mutate: create, isPending } = useCreateAccount();

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";
  const reset = () => { setName(""); setType("savings" as LinkedAccountType); setCurrency("INR" as Currency); setBalance(""); };

  const submit = () => {
    if (!name.trim()) return;
    create(
      { name: name.trim(), type, currency, balance: parseFloat(balance) || 0, off_budget: true },
      {
        onSuccess: () => { toast.success("Account added"); setOpen(false); reset(); },
        onError: e => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Investment Account</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
            This creates a real account you can transfer money to/from in the Budget page. It will appear here under Linked Accounts.
          </p>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HYSA, Brokerage Cash" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select value={type} onChange={e => setType(e.target.value as LinkedAccountType)} className={sel}>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div>
              <Label>Currency</Label>
              <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className={sel}>
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Opening Balance <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00" className="mt-1" />
          </div>
          <Button className="w-full" onClick={submit} disabled={isPending || !name.trim()}>Add Account</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Update Value Dialog ──────────────────────────────────────────────────────

function UpdateValueDialog({ account, trigger }: { account: any; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const { mutate: createTxn, isPending } = useCreateTransaction();

  const currentBalance = account.balance as number;
  const parsed = parseFloat(newValue);
  const delta = !isNaN(parsed) ? parsed - currentBalance : null;
  const isGain = delta !== null && delta > 0;

  const submit = () => {
    if (delta === null || delta === 0) { setOpen(false); return; }
    createTxn(
      {
        account_id: account.id,
        payee: "Valuation Update",
        amount: Math.abs(delta),
        type: isGain ? "income" : "expense",
        date: new Date().toISOString().slice(0, 10),
        notes: `Value updated from ${formatCurrency(currentBalance, account.currency)} to ${formatCurrency(parsed, account.currency)}`,
      },
      {
        onSuccess: () => { toast.success("Value updated"); setOpen(false); setNewValue(""); },
        onError: e => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) setNewValue(String(currentBalance)); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Value — {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current value: </span>
            <span className="font-semibold">{formatCurrency(currentBalance, account.currency)}</span>
          </div>
          <div>
            <Label>New Value ({account.currency})</Label>
            <Input
              type="number"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder={String(currentBalance)}
              className="mt-1"
              autoFocus
            />
          </div>
          {delta !== null && delta !== 0 && (
            <div className={`rounded-md px-3 py-2 text-sm font-medium ${isGain ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
              {isGain ? "Gain" : "Loss"}: {isGain ? "+" : "−"}{formatCurrency(Math.abs(delta), account.currency)}
              {" "}will be recorded as a {isGain ? "income" : "expense"} transaction.
            </div>
          )}
          <Button className="w-full" onClick={submit} disabled={isPending || delta === null || delta === 0}>
            Record Update
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add / Edit Dialog ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "", asset_type: "mutual_fund", currency: "INR",
  purchase_value: "", current_value: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  units: "", notes: "",
};

function InvestmentFormDialog({
  trigger, title, initial, onSubmit, isPending,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: typeof EMPTY_FORM;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const defaultCurrency = useAppStore(s => s.defaultCurrency);
  const emptyForm = { ...EMPTY_FORM, currency: defaultCurrency };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial ?? emptyForm);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const isINR = form.currency === "INR";

  const submit = () => {
    if (!form.name.trim() || !form.purchase_value || !form.purchase_date) return;
    onSubmit({
      name: form.name.trim(),
      asset_type: form.asset_type,
      currency: form.currency,
      purchase_value: parseFloat(form.purchase_value),
      current_value: parseFloat(form.current_value || form.purchase_value),
      purchase_date: form.purchase_date,
      units: form.units ? parseFloat(form.units) : undefined,
      notes: form.notes || undefined,
    });
    setOpen(false);
  };

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) setForm(initial ?? emptyForm); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={set("name")} placeholder="e.g. S&P 500 Index Fund" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Asset Type</Label>
              <select value={form.asset_type} onChange={set("asset_type")} className={sel}>
                {ASSET_TYPES.map(t => <option key={t} value={t}>{ASSET_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <Label>Currency</Label>
              <select value={form.currency} onChange={set("currency")} className={sel}>
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Purchase Value <span className="text-muted-foreground text-xs">({form.currency})</span></Label>
              <Input type="number" value={form.purchase_value} onChange={set("purchase_value")} placeholder="50000" className="mt-1" />
            </div>
            <div>
              <Label>Current Value <span className="text-muted-foreground text-xs">({form.currency})</span></Label>
              <Input type="number" value={form.current_value} onChange={set("current_value")} placeholder="55000" className="mt-1" />
            </div>
          </div>

          {!isINR && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              Values are in <strong>{form.currency}</strong>. The INR equivalent will be calculated automatically using stored exchange rates. Refresh rates in Settings if needed.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Units <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="number" value={form.units} onChange={set("units")} placeholder="100.5" className="mt-1" />
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchase_date} onChange={set("purchase_date")} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={form.notes} onChange={set("notes")} placeholder="e.g. monthly auto-invest, direct" className="mt-1" />
          </div>

          <Button className="w-full" onClick={submit} disabled={isPending || !form.name.trim() || !form.purchase_value}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const { data, isLoading, error } = useInvestments();
  const { data: portfolio } = usePortfolioSummary();
  const { mutate: refreshPrice } = useRefreshPrice();
  const { mutate: deleteInv } = useDeleteInvestment();
  const { mutate: createInv, isPending: creating } = useCreateInvestment();
  const { mutate: updateInv, isPending: updating } = useUpdateInvestment();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const { data: accountsData } = useAccounts();
  const { mutate: deleteAccount } = useDeleteAccount();
  const [sheetAccount, setSheetAccount] = useState<any | null>(null);

  const defaultCurrency = useAppStore(s => s.defaultCurrency);
  const { data: rates = {} } = useExchangeRates();
  const fmt = (inr: number) => formatCurrency(convertFromINR(inr, defaultCurrency as any, rates), defaultCurrency as any);

  const linkedAccounts = (accountsData?.accounts ?? []).filter(
    a => a.off_budget && (a.type === "investment" || a.type === "savings")
  );

  const donutData = portfolio
    ? Object.entries(portfolio.by_asset_type).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investments</h1>
          {portfolio && (
            <p className="text-sm text-muted-foreground">
              Portfolio: <span className="font-semibold text-foreground">{fmt(portfolio.total_inr)}</span>
            </p>
          )}
        </div>
        <InvestmentFormDialog
          title="Add Investment"
          trigger={<Button size="sm"><PlusCircle className="w-4 h-4 mr-1" />Add Investment</Button>}
          isPending={creating}
          onSubmit={data => createInv(data, {
            onSuccess: () => toast.success("Investment added"),
            onError: e => toast.error(e.message),
          })}
        />
      </div>

      {/* Portfolio breakdown */}
      {portfolio && donutData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Portfolio Breakdown</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-6">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                  {donutData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {donutData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{ASSET_LABELS[d.name] ?? d.name}</span>
                  <span className="font-medium ml-auto pl-4">{fmt(d.value)}</span>
                </div>
              ))}
              <div className="border-t pt-1.5 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{fmt(portfolio.total_inr)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Accounts (off-budget savings / investment accounts) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Linked Accounts</CardTitle>
          <AddLinkedAccountDialog
            trigger={
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <PlusCircle className="w-3.5 h-3.5 mr-1" />Add Account
              </Button>
            }
          />
        </CardHeader>
        {linkedAccounts.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              No linked accounts. Add a savings or investment account to transfer money here from Budget.
            </p>
          </CardContent>
        ) : (
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Balance</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {linkedAccounts.map(a => {
                  const isINR = a.currency === "INR";
                  const displayBalance = formatCurrency(a.balance, a.currency as any);
                  const inrBalance = fmt(a.balance_inr);
                  return (
                    <tr key={a.id} className="hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setSheetAccount(a)}>
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs capitalize">{a.type}</Badge>
                        <div className="text-xs text-muted-foreground mt-0.5">{a.currency}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium tabular-nums">{displayBalance}</div>
                        {!isINR && (
                          <div className="text-xs text-muted-foreground tabular-nums">≈ {inrBalance}</div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <UpdateValueDialog
                            account={a}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Update current value">
                                <ArrowUpDown className="w-3 h-3" />
                              </Button>
                            }
                          />
                          <LinkedAccountEditDialog
                            account={a}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit account">
                                <Pencil className="w-3 h-3" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            title="Delete account"
                            onClick={() => deleteAccount(a.id, {
                              onSuccess: () => toast.success("Account deleted"),
                              onError: e => toast.error(e.message),
                            })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {sheetAccount && (
        <LinkedAccountSheet
          account={sheetAccount}
          open={!!sheetAccount}
          onOpenChange={open => { if (!open) setSheetAccount(null); }}
          allAccounts={accountsData?.accounts ?? []}
        />
      )}

      {error && <Alert variant="destructive"><AlertDescription>Failed to load investments.</AlertDescription></Alert>}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !data || data.investments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No investments yet — add your first one.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Purchase</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Current</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gain / Loss</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.investments.map(inv => (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{inv.name}</div>
                    {inv.units && (
                      <div className="text-xs text-muted-foreground">{inv.units} units</div>
                    )}
                    {inv.current_value_at && (
                      <div className="text-xs text-muted-foreground">
                        Updated {new Date(inv.current_value_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">
                      {ASSET_LABELS[inv.asset_type] ?? inv.asset_type}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-0.5">{inv.currency}</div>
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell
                      native={inv.purchase_value}
                      nativeCurrency={inv.currency}
                      inr={inv.purchase_value_inr}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyCell
                      native={inv.current_value}
                      nativeCurrency={inv.currency}
                      inr={inv.current_value_inr}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <GainLossCell inv={inv} fmt={fmt} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <InvestmentFormDialog
                        title="Edit Investment"
                        trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit investment">
                            <Pencil className="w-3 h-3" />
                          </Button>
                        }
                        isPending={updating}
                        initial={{
                          name: inv.name,
                          asset_type: inv.asset_type,
                          currency: inv.currency,
                          purchase_value: String(inv.purchase_value),
                          current_value: String(inv.current_value),
                          purchase_date: inv.purchase_date,
                          units: inv.units != null ? String(inv.units) : "",
                          notes: inv.notes ?? "",
                        }}
                        onSubmit={data => updateInv({ id: inv.id, data }, {
                          onSuccess: () => toast.success("Investment updated"),
                          onError: e => toast.error(e.message),
                        })}
                      />
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        disabled={refreshingId === inv.id}
                        title="Refresh price from web"
                        onClick={() => {
                          setRefreshingId(inv.id);
                          refreshPrice(inv.id, {
                            onSuccess: () => { toast.success("Price refreshed"); setRefreshingId(null); },
                            onError: e => { toast.error(e.message); setRefreshingId(null); },
                          });
                        }}
                      >
                        <RefreshCw className={`w-3 h-3 ${refreshingId === inv.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        title="Delete investment"
                        onClick={() => deleteInv(inv.id, {
                          onSuccess: () => toast.success("Deleted"),
                          onError: e => toast.error(e.message),
                        })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
