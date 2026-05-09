import { Fragment, useState } from "react";
import { toast } from "sonner";
import { convertFromINR, formatCurrency } from "@finwise/shared/utils";
import { useAppStore } from "@/stores/app.store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CornerUpLeft, Pencil, PlusCircle, Trash2, TrendingUp } from "lucide-react";
import {
  useAccounts,
  useCreateAccount,
  useCreateEnvelope,
  useCreateEnvelopeGroup,
  useCreateRecurring,
  useCreateTransaction,
  useCreateTransfer,
  useDeleteAccount,
  useDeleteEnvelope,
  useDeleteEnvelopeGroup,
  useReclaimEnvelope,
  useDeleteTransaction,
  useUpdateTransaction,
  useEnvelopeGroups,
  useEnvelopes,
  useMonthlySummary,
  useTransactions,
  useExchangeRates,
  useUpdateAccount,
  useUpdateEnvelope,
} from "../hooks/useBudget";

// ─── Month Selector ────────────────────────────────────────────────────────────

function MonthSelector() {
  const { selectedMonth, setSelectedMonth } = useAppStore();
  const [year, mon] = selectedMonth.split("-").map(Number);
  const label = new Date(year, mon - 1).toLocaleString("default", { month: "long", year: "numeric" });

  const prev = () => {
    const d = new Date(year, mon - 2);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const next = () => {
    const d = new Date(year, mon);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="w-4 h-4" /></Button>
      <span className="text-sm font-medium w-36 text-center">{label}</span>
      <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
}

// ─── Account Dialogs ───────────────────────────────────────────────────────────

function AccountDialog({
  trigger, initial, onSubmit, isPending, title,
}: {
  trigger: React.ReactNode;
  initial?: { name: string; type: string; currency: string; balance: number; off_budget?: boolean };
  onSubmit: (data: { name: string; type: string; currency: string; balance: number; off_budget: boolean }) => void;
  isPending: boolean;
  title: string;
}) {
  const defaultCurrency = useAppStore(s => s.defaultCurrency);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "checking");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [balance, setBalance] = useState(String(initial?.balance ?? 0));
  const [offBudget, setOffBudget] = useState(initial?.off_budget ?? false);

  const reset = () => {
    setName(initial?.name ?? ""); setType(initial?.type ?? "checking");
    setCurrency(initial?.currency ?? defaultCurrency); setBalance(String(initial?.balance ?? 0));
    setOffBudget(initial?.off_budget ?? false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Checking" className="mt-1" /></div>
          <div>
            <Label>Type</Label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background">
              {["checking", "savings", "credit", "investment", "cash"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Currency</Label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background">
              {["INR", "USD", "SGD", "GBP", "EUR", "JPY", "NTD"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Balance</Label><Input type="number" value={balance} onChange={e => setBalance(e.target.value)} className="mt-1" /></div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={offBudget} onChange={e => setOffBudget(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            <span className="text-sm">Off budget</span>
            <span className="text-xs text-muted-foreground">(tracked for net worth, not against envelopes)</span>
          </label>
          <Button className="w-full" onClick={() => { if (!name.trim()) return; onSubmit({ name: name.trim(), type: type as any, currency, balance: parseFloat(balance) || 0, off_budget: offBudget }); setOpen(false); reset(); }} disabled={isPending || !name.trim()}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountTransactionsDialog({ account }: { account: any }) {
  const [open, setOpen] = useState(false);

  const { data } = useTransactions({ account_id: account.id, limit: 200 });
  const { mutate: deleteTxn } = useDeleteTransaction();
  const { mutate: updateTxn, isPending: updatingTxn } = useUpdateTransaction();
  const { mutate: createTxn, isPending: creating } = useCreateTransaction();
  const { mutate: createTransfer, isPending: transferring } = useCreateTransfer();
  const { data: accountsData } = useAccounts();
  const { defaultCurrency, selectedMonth } = useAppStore();
  const { data: rates = {} } = useExchangeRates();
  const { data: envelopesData } = useEnvelopes(selectedMonth);
  const txns = data?.transactions ?? [];
  const allEnvelopes = (envelopesData as any)?.envelopes ?? [];
  const allAccounts = accountsData?.accounts ?? [];

  const fmtDefault = (inr: number) =>
    formatCurrency(convertFromINR(inr, defaultCurrency as any, rates), defaultCurrency as any);
  const showHint = account.currency !== defaultCurrency;

  const sel = "w-full border rounded-md px-3 py-2 text-sm bg-background";
  const envelopesByGroup = (allEnvelopes as any[]).reduce<{ groupId: string; groupName: string; items: any[] }[]>((acc: { groupId: string; groupName: string; items: any[] }[], env: any) => {
    const existing = acc.find(g => g.groupId === env.group_id);
    if (existing) existing.items.push(env);
    else acc.push({ groupId: env.group_id, groupName: env.group_name ?? "Other", items: [env] });
    return acc;
  }, []);

  // ── New transaction form ──────────────────────────────────────────────────
  const [tab, setTab] = useState<"expense" | "income" | "transfer">("expense");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [envelope, setEnvelope] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [transferDir, setTransferDir] = useState<"out" | "in">("out");
  const [inlineIncomeCategory, setInlineIncomeCategory] = useState<"income" | "cashback" | "starting_balance">("income");

  const toAcc = allAccounts.find((a: any) => a.id === toAccount);
  const sameCurrency = toAcc && toAcc.currency === account.currency;

  const resetForm = () => {
    setPayee(""); setAmount(""); setToAmount(""); setDate(new Date().toISOString().slice(0, 10));
    setEnvelope(""); setToAccount(""); setInlineIncomeCategory("income"); setTransferDir("out");
  };

  const submitTxn = () => {
    if (tab === "transfer") {
      if (!toAccount || !amount) return;
      const fromId = transferDir === "out" ? account.id : toAccount;
      const toId = transferDir === "out" ? toAccount : account.id;
      const fromAmt = parseFloat(amount);
      const toAmt = sameCurrency ? fromAmt : parseFloat(toAmount || amount);
      createTransfer({
        from_account_id: fromId,
        to_account_id: toId,
        amount: fromAmt,
        to_amount: toAmt,
        date,
        notes: payee || undefined,
        envelope_id: envelope || undefined,
      }, {
        onSuccess: () => { toast.success("Transfer recorded"); resetForm(); },
        onError: e => toast.error(e.message),
      });
    } else {
      if (!payee.trim() || !amount) return;
      createTxn({
        account_id: account.id,
        envelope_id: envelope || undefined,
        payee: payee.trim(),
        amount: parseFloat(amount),
        type: tab,
        date,
        ...(tab === "income" ? { income_category: inlineIncomeCategory } : {}),
      }, {
        onSuccess: () => { toast.success("Transaction added"); resetForm(); },
        onError: e => toast.error(e.message),
      });
    }
  };

  // ── Inline edit state ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPayee, setEditPayee] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState<"income" | "expense" | "transfer">("expense");
  const [editEnvelope, setEditEnvelope] = useState("");
  const [editToAccount, setEditToAccount] = useState("");
  const [editIncomeCategory, setEditIncomeCategory] = useState<"income" | "cashback" | "starting_balance">("income");

  const startEdit = (t: any) => {
    setEditingId(t.id);
    setEditPayee(t.payee);
    setEditAmount(String(t.amount));
    setEditDate(t.date);
    setEditType(t.type as "income" | "expense" | "transfer");
    setEditEnvelope(t.envelope_id ?? "");
    setEditToAccount("");
    setEditIncomeCategory((t.income_category as "income" | "cashback" | "starting_balance") ?? "income");
  };

  const saveEdit = (t: any) => {
    // Converting to a transfer: delete old txn, create proper paired transfer
    if (editType === "transfer" && t.type !== "transfer") {
      if (!editToAccount) { toast.error("Select a destination account"); return; }
      deleteTxn(t.id, {
        onSuccess: () => {
          createTransfer({
            from_account_id: account.id,
            to_account_id: editToAccount,
            amount: parseFloat(editAmount),
            to_amount: parseFloat(editAmount),
            date: editDate,
            notes: editPayee || undefined,
            envelope_id: editEnvelope || undefined,
          }, {
            onSuccess: () => { toast.success("Converted to transfer"); setEditingId(null); },
            onError: e => toast.error(e.message),
          });
        },
        onError: e => toast.error(e.message),
      });
      return;
    }

    // Regular patch
    const patch: any = {};
    if (editPayee !== t.payee) patch.payee = editPayee;
    if (parseFloat(editAmount) !== t.amount) patch.amount = parseFloat(editAmount);
    if (editDate !== t.date) patch.date = editDate;
    if (t.type !== "transfer" && editType !== t.type) patch.type = editType;
    const envVal = editEnvelope || null;
    if (envVal !== (t.envelope_id ?? null)) patch.envelope_id = envVal;
    if ((editType === "income" || t.type === "income") && editIncomeCategory !== (t.income_category ?? "income")) {
      patch.income_category = editIncomeCategory;
    }
    if (Object.keys(patch).length === 0) { setEditingId(null); return; }
    updateTxn({ id: t.id, data: patch }, {
      onSuccess: () => { toast.success("Updated"); setEditingId(null); },
      onError: e => toast.error(e.message),
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Card className="w-44 group relative cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground truncate pr-10">{account.name}</p>
            <p className="font-semibold text-sm">{formatCurrency(account.balance, account.currency)}</p>
            {showHint && <p className="text-xs text-muted-foreground">≈ {fmtDefault(account.balance_inr)}</p>}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <AccountEditDeleteButtons account={account} />
            </div>
          </CardContent>
        </Card>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:w-[680px] sm:max-w-none flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0 pr-14">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-lg leading-tight">{account.name}</SheetTitle>
            <div className="flex gap-1"><AccountEditDeleteButtons account={account} /></div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Balance:{" "}
            <span className="font-semibold text-foreground">{formatCurrency(account.balance, account.currency)}</span>
            {showHint && <span className="ml-1.5 text-xs">≈ {fmtDefault(account.balance_inr)}</span>}
            <span className="ml-2 text-xs bg-muted rounded px-1.5 py-0.5">{account.currency}</span>
          </p>
        </SheetHeader>

        {/* ── New transaction form ──────────────────────────────────── */}
        <div className="px-6 py-4 border-b flex-shrink-0 bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">New Transaction</p>
          <div className="flex rounded-lg border overflow-hidden text-sm mb-3">
            {(["expense", "income", "transfer"] as const).map(t => (
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
                  <select value={toAccount} onChange={e => { setToAccount(e.target.value); setToAmount(""); }} className={`${sel} mt-1 h-8 py-1`}>
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
              {!sameCurrency && toAcc && (
                <div>
                  <Label className="text-xs">{transferDir === "out" ? `Received (${toAcc.currency})` : `Deducted (${toAcc.currency})`}</Label>
                  <Input type="number" value={toAmount} onChange={e => setToAmount(e.target.value)} placeholder="0.00" className="mt-1 h-8 text-sm" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Monthly savings" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Category <span className="text-muted-foreground">(optional)</span></Label>
                  <select value={envelope} onChange={e => setEnvelope(e.target.value)} className={`${sel} mt-1 h-8 py-1`}>
                    <option value="">None</option>
                    {envelopesByGroup.map(({ groupId, groupName, items }) => (
                      <optgroup key={groupId} label={groupName}>
                        {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <Button className="w-full h-8 text-sm" onClick={submitTxn}
                disabled={transferring || !toAccount || !amount || (!sameCurrency && !toAmount && !!toAcc)}>
                <PlusCircle className="w-3.5 h-3.5 mr-1.5" />Record transfer
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payee</Label>
                  <Input value={payee} onChange={e => setPayee(e.target.value)}
                    placeholder={tab === "income" ? "e.g. Employer" : "e.g. Coffee Shop"}
                    className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Amount ({account.currency})</Label>
                  <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1 h-8 text-sm" />
                </div>
                {tab === "expense" && (
                  <div>
                    <Label className="text-xs">Category</Label>
                    <select value={envelope} onChange={e => setEnvelope(e.target.value)} className={`${sel} mt-1 h-8 py-1`}>
                      <option value="">Uncategorised</option>
                      {envelopesByGroup.map(({ groupId, groupName, items }) => (
                        <optgroup key={groupId} label={groupName}>
                          {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
                {tab === "income" && (
                  <div>
                    <Label className="text-xs">Category</Label>
                    <select value={inlineIncomeCategory} onChange={e => setInlineIncomeCategory(e.target.value as any)} className={`${sel} mt-1 h-8 py-1`}>
                      <option value="income">Income</option>
                      <option value="cashback">Cashback</option>
                      <option value="starting_balance">Starting Balance</option>
                    </select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <Button className="w-full h-8 text-sm" onClick={submitTxn} disabled={creating || !payee.trim() || !amount}>
                <PlusCircle className="w-3.5 h-3.5 mr-1.5" />Add {tab}
              </Button>
            </div>
          )}
        </div>

        {/* ── Transaction list ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No transactions for this account yet.</p>
          ) : (
            <div className="divide-y">
              {txns.map((t: any) => (
                <Fragment key={t.id}>
                  {editingId === t.id ? (
                    /* ── Inline edit form ── */
                    <div className="px-6 py-3 bg-muted/40 border-l-2 border-primary space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Payee</Label>
                          <Input value={editPayee} onChange={e => setEditPayee(e.target.value)} className="mt-1 h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Amount ({account.currency})</Label>
                          <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="mt-1 h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Type</Label>
                          <select
                            value={editType}
                            onChange={e => { setEditType(e.target.value as any); setEditEnvelope(""); setEditToAccount(""); }}
                            className={`${sel} mt-1 h-8 py-1`}
                          >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                            {t.type !== "transfer" && <option value="transfer">Transfer</option>}
                          </select>
                        </div>
                        {editType === "transfer" && t.type !== "transfer" ? (
                          <div>
                            <Label className="text-xs">To account</Label>
                            <select value={editToAccount} onChange={e => setEditToAccount(e.target.value)} className={`${sel} mt-1 h-8 py-1`}>
                              <option value="">Select account</option>
                              {allAccounts.filter((a: any) => a.id !== account.id).map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                              ))}
                            </select>
                          </div>
                        ) : editType === "income" ? (
                          <div>
                            <Label className="text-xs">Category</Label>
                            <select value={editIncomeCategory} onChange={e => setEditIncomeCategory(e.target.value as any)} className={`${sel} mt-1 h-8 py-1`}>
                              <option value="income">Income</option>
                              <option value="cashback">Cashback</option>
                              <option value="starting_balance">Starting Balance</option>
                            </select>
                          </div>
                        ) : (editType === "expense" || t.type === "transfer") ? (
                          <div>
                            <Label className="text-xs">Category</Label>
                            <select value={editEnvelope} onChange={e => setEditEnvelope(e.target.value)} className={`${sel} mt-1 h-8 py-1`}>
                              <option value="">Uncategorised</option>
                              {envelopesByGroup.map(({ groupId, groupName, items }) => (
                                <optgroup key={groupId} label={groupName}>
                                  {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        {editType === "transfer" && t.type !== "transfer" && (
                          <div>
                            <Label className="text-xs">Category <span className="text-muted-foreground">(optional)</span></Label>
                            <select value={editEnvelope} onChange={e => setEditEnvelope(e.target.value)} className={`${sel} mt-1 h-8 py-1`}>
                              <option value="">None</option>
                              {envelopesByGroup.map(({ groupId, groupName, items }) => (
                                <optgroup key={groupId} label={groupName}>
                                  {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">Date</Label>
                          <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="mt-1 h-8 text-sm" />
                        </div>
                      </div>
                      {editType === "transfer" && t.type !== "transfer" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          This will delete the current transaction and create a paired transfer.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(t)} disabled={updatingTxn || transferring}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 group/row transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.payee}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.date}
                          {t.envelope_name && <span className="ml-1.5 text-indigo-500">· {t.envelope_name}</span>}
                          {t.type === "transfer" && <span className="ml-1.5 text-blue-500">· transfer</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                        <div className="text-right mr-1.5">
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
                          className="opacity-0 group-hover/row:opacity-100 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                          onClick={() => startEdit(t)}
                          title="Edit transaction"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <ConfirmDialog
                          trigger={
                            <button className="opacity-0 group-hover/row:opacity-100 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-opacity">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          }
                          title="Delete transaction?"
                          description="This transaction will be permanently removed."
                          onConfirm={() => deleteTxn(t.id, { onSuccess: () => toast.success("Deleted") })}
                        />
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AccountEditDeleteButtons({ account }: { account: any }) {
  const { mutate: update, isPending: updating } = useUpdateAccount();
  const { mutate: remove, isPending: deleting } = useDeleteAccount();
  return (
    <>
      <AccountDialog
        title="Edit Account"
        initial={{ name: account.name, type: account.type, currency: account.currency, balance: account.balance, off_budget: account.off_budget }}
        trigger={<button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>}
        isPending={updating}
        onSubmit={data => update({ id: account.id, data }, { onSuccess: () => toast.success("Account updated"), onError: e => toast.error(e.message) })}
      />
      <ConfirmDialog
        trigger={<button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500" disabled={deleting}><Trash2 className="w-3 h-3" /></button>}
        title={`Delete "${account.name}"?`}
        description="This will permanently delete the account. Transactions linked to it will remain."
        onConfirm={() => remove(account.id, { onSuccess: () => toast.success("Account deleted"), onError: e => toast.error(e.message) })}
      />
    </>
  );
}

// ─── Envelope Group Section ────────────────────────────────────────────────────

function EnvelopeFormDialog({
  trigger, title, initial, onSubmit, isPending, selectedMonth, groups,
}: {
  trigger: React.ReactNode; title: string;
  initial?: { name: string; budgeted: number; budget_currency?: string; group_id: string };
  onSubmit: (data: { name: string; budgeted: number; budget_currency: string; group_id: string; month: string; rollover_type: "none"; rollover_amount: number }) => void;
  isPending: boolean; selectedMonth: string;
  groups: { id: string; name: string }[];
}) {
  const defaultCurrency = useAppStore(s => s.defaultCurrency);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [budgeted, setBudgeted] = useState(String(initial?.budgeted ?? 0));
  const [budgetCurrency, setBudgetCurrency] = useState(initial?.budget_currency ?? defaultCurrency);
  const [groupId, setGroupId] = useState(initial?.group_id ?? groups[0]?.id ?? "");

  const reset = () => {
    setName(initial?.name ?? "");
    setBudgeted(String(initial?.budgeted ?? 0));
    setBudgetCurrency(initial?.budget_currency ?? defaultCurrency);
    setGroupId(initial?.group_id ?? groups[0]?.id ?? "");
  };

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Groceries" className="mt-1" /></div>
          <div>
            <Label>Category</Label>
            {groups.length === 0
              ? <p className="text-xs text-muted-foreground mt-1">Add a category first using the + button.</p>
              : <select value={groupId} onChange={e => setGroupId(e.target.value)} className={sel}>
                  <option value="">Select category</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
            }
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Monthly Budget</Label>
              <Input type="number" value={budgeted} onChange={e => setBudgeted(e.target.value)} placeholder="1000" className="mt-1" />
            </div>
            <div>
              <Label>Currency</Label>
              <select value={budgetCurrency} onChange={e => setBudgetCurrency(e.target.value)} className={sel}>
                {["INR","USD","SGD","GBP","EUR","JPY","NTD"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {budgetCurrency !== "INR" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
              Budget is in <strong>{budgetCurrency}</strong>. The ₹ equivalent is computed automatically using stored exchange rates.
            </p>
          )}
          <Button className="w-full" onClick={() => { if (!name.trim() || !groupId) return; onSubmit({ name: name.trim(), budgeted: parseFloat(budgeted) || 0, budget_currency: budgetCurrency, group_id: groupId, month: selectedMonth, rollover_type: "none", rollover_amount: 0 }); setOpen(false); reset(); }} disabled={isPending || !name.trim() || !groupId}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable confirm dialog (replaces window.confirm which is blocked in Tauri) ─

function ConfirmDialog({
  trigger,
  title,
  description,
  onConfirm,
  destructive = true,
  confirmLabel = "Delete",
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  destructive?: boolean;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={() => { onConfirm(); setOpen(false); }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCategoryDialog({ onAdd, isPending }: { onAdd: (name: string) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setName(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <PlusCircle className="w-3 h-3 mr-1" />Add Category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Needs, Wants, Savings, Misc" className="mt-1"
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setOpen(false); setName(""); } }}
            />
          </div>
          <Button className="w-full" disabled={!name.trim() || isPending}
            onClick={() => { onAdd(name.trim()); setOpen(false); setName(""); }}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BudgetTable({
  groupedEnvelopes, selectedMonth, groups, fmtBudget,
}: {
  groupedEnvelopes: { group: { id: string; name: string }; envelopes: any[] }[];
  selectedMonth: string;
  groups: { id: string; name: string }[];
  fmtBudget: (n: number) => string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<{ envId: string; value: string } | null>(null);

  const { mutate: createEnvelope, isPending: creatingEnv } = useCreateEnvelope();
  const { mutate: updateEnvelope } = useUpdateEnvelope();
  const { mutate: deleteEnvelope } = useDeleteEnvelope();
  const { mutate: reclaimEnvelope } = useReclaimEnvelope();
  const { mutate: deleteGroup } = useDeleteEnvelopeGroup();

  // Income transactions for this month — for the income breakdown at the bottom
  const [year, mon] = selectedMonth.split("-").map(Number);
  const dateFrom = `${selectedMonth}-01`;
  const dateTo = `${selectedMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;
  const { data: incomeTxnData } = useTransactions({ type: "income", date_from: dateFrom, date_to: dateTo, limit: 200 });
  const { data: rates = {} } = useExchangeRates();

  type IncomeGroup = "income" | "cashback" | "starting_balance";
  const INCOME_GROUPS: { key: IncomeGroup; label: string }[] = [
    { key: "income", label: "Income" },
    { key: "cashback", label: "Cashback" },
    { key: "starting_balance", label: "Starting Balances" },
  ];

  const incomeByGroup = (incomeTxnData?.transactions ?? []).reduce<Record<IncomeGroup, Record<string, number>>>(
    (acc, t: any) => {
      const cat: IncomeGroup = t.income_category ?? "income";
      const inr = t.currency && t.currency !== "INR" ? t.amount * (rates[t.currency] ?? 1) : t.amount;
      acc[cat][t.payee] = (acc[cat][t.payee] ?? 0) + inr;
      return acc;
    },
    { income: {}, cashback: {}, starting_balance: {} }
  );

  const toggleGroup = (id: string) =>
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const saveBudget = (envId: string, value: string) => {
    const n = parseFloat(value);
    if (!isNaN(n)) {
      updateEnvelope({ id: envId, data: { budgeted: n } }, {
        onSuccess: () => toast.success("Budget updated"),
        onError: e => toast.error(e.message),
      });
    }
    setEditingBudget(null);
  };

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm min-w-[500px]">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">Category</th>
            <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide w-36">Budgeted</th>
            <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide w-36">Spent</th>
            <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wide w-36">Balance</th>
            <th className="w-16 px-2" />
          </tr>
        </thead>
        <tbody>
          {groupedEnvelopes.map(({ group, envelopes }) => {
            const isCollapsed = collapsed.has(group.id);
            const totalBudgeted = envelopes.reduce((s, e) => s + (e.budgeted_inr ?? e.budgeted), 0);
            const totalSpent    = envelopes.reduce((s, e) => s + e.spent, 0);
            const totalBalance  = totalBudgeted - totalSpent;
            return (
              <Fragment key={group.id}>
                {/* Group header row */}
                <tr
                  className="border-t bg-muted/20 hover:bg-muted/30 cursor-pointer select-none group/grp"
                  onClick={() => toggleGroup(group.id)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-semibold">
                      {isCollapsed
                        ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        : <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      }
                      {group.name}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {fmtBudget(totalBudgeted)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${totalSpent > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {totalSpent > 0 ? `−${fmtBudget(totalSpent)}` : "—"}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${totalBalance < 0 ? "text-red-500" : totalBalance === 0 && totalBudgeted > 0 ? "text-muted-foreground" : ""}`}>
                    {fmtBudget(totalBalance)}
                  </td>
                  <td className="px-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-0.5 justify-end opacity-0 group-hover/grp:opacity-100 transition-opacity">
                      <EnvelopeFormDialog
                        title="Add Envelope"
                        trigger={<button className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"><PlusCircle className="w-3.5 h-3.5" /></button>}
                        isPending={creatingEnv} selectedMonth={selectedMonth} groups={groups}
                        initial={{ name: "", budgeted: 0, group_id: group.id }}
                        onSubmit={data => createEnvelope(data as any, { onSuccess: () => toast.success("Envelope added"), onError: e => toast.error(e.message) })}
                      />
                      <ConfirmDialog
                        trigger={<button className="p-1 rounded hover:bg-background text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                        title={`Delete "${group.name}"?`}
                        description="This will permanently delete this category and all its envelopes. Transactions will be uncategorised."
                        onConfirm={() => deleteGroup(group.id, { onSuccess: () => toast.success("Category deleted"), onError: e => toast.error(e.message) })}
                      />
                    </div>
                  </td>
                </tr>

                {/* Envelope rows */}
                {!isCollapsed && envelopes.map(env => {
                  const budgetedInr = env.budgeted_inr ?? env.budgeted;
                  const balance = budgetedInr - env.spent;
                  const isEditing = editingBudget?.envId === env.id;
                  const hasForeignCurrency = env.budget_currency && env.budget_currency !== "INR";
                  return (
                    <tr key={env.id} className="border-t border-border/30 hover:bg-muted/10 group/env transition-colors">
                      <td className="px-4 py-2 pl-10 text-sm">{env.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {hasForeignCurrency && <span className="text-xs text-muted-foreground">{env.budget_currency}</span>}
                            <input
                              autoFocus
                              type="number"
                              value={editingBudget!.value}
                              onChange={e => setEditingBudget({ envId: env.id, value: e.target.value })}
                              onBlur={() => saveBudget(env.id, editingBudget!.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter")  saveBudget(env.id, editingBudget!.value);
                                if (e.key === "Escape") setEditingBudget(null);
                              }}
                              className="w-28 text-right bg-background border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:underline hover:text-primary transition-colors"
                            title={hasForeignCurrency ? `${env.budgeted} ${env.budget_currency} — click to edit` : "Click to edit"}
                            onClick={() => setEditingBudget({ envId: env.id, value: String(Math.max(0, env.budgeted)) })}
                          >
                            {fmtBudget(budgetedInr)}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${env.spent > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {env.spent > 0 ? `−${fmtBudget(env.spent)}` : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${balance < 0 ? "text-red-500 font-medium" : balance === 0 ? "text-muted-foreground" : ""}`}>
                        {fmtBudget(balance)}
                      </td>
                      <td className="px-2">
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover/env:opacity-100 transition-opacity">
                          {balance > 0 && (
                            <ConfirmDialog
                              trigger={<button title="Return leftover budget to global pool" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-green-600"><CornerUpLeft className="w-3 h-3" /></button>}
                              title={`Return ${fmtBudget(balance)} to pool?`}
                              description={`The ${fmtBudget(balance)} left in "${env.name}" will be returned to your unassigned budget. You can re-allocate it to any envelope at any time.`}
                              confirmLabel="Return to pool"
                              destructive={false}
                              onConfirm={() => reclaimEnvelope(env.id, {
                                onSuccess: (r) => toast.success(`Returned ${fmtBudget(r.reclaimed_inr)} to pool`),
                                onError: (e) => toast.error(e.message),
                              })}
                            />
                          )}
                          <EnvelopeFormDialog
                            title="Edit Envelope"
                            trigger={<button className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>}
                            initial={{ name: env.name, budgeted: Math.max(0, env.budgeted), budget_currency: env.budget_currency, group_id: env.group_id }}
                            isPending={false} selectedMonth={selectedMonth} groups={groups}
                            onSubmit={({ name, budgeted, budget_currency, group_id }) =>
                              updateEnvelope({ id: env.id, data: { name, budgeted, budget_currency, group_id } }, {
                                onSuccess: () => toast.success("Envelope updated"),
                                onError: e => toast.error(e.message),
                              })
                            }
                          />
                          <ConfirmDialog
                            trigger={<button className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>}
                            title={`Delete "${env.name}"?`}
                            description="This envelope will be removed. Transactions assigned to it will become uncategorised."
                            onConfirm={() => deleteEnvelope(env.id, { onSuccess: () => toast.success("Envelope deleted"), onError: e => toast.error(e.message) })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}

          {/* Income breakdown — three collapsible groups */}
          {INCOME_GROUPS.map(({ key, label }, idx) => {
            const byPayee = incomeByGroup[key];
            const groupTotal = Object.values(byPayee).reduce((s, v) => s + v, 0);
            const hasEntries = Object.keys(byPayee).length > 0;
            const isGroupCollapsed = collapsed.has(`__income_${key}`);
            return (
              <Fragment key={key}>
                <tr
                  className={`${idx === 0 ? "border-t-2 border-green-500/30" : "border-t border-green-500/20"} bg-green-500/5 ${hasEntries ? "cursor-pointer hover:bg-green-500/10" : ""}`}
                  onClick={() => hasEntries && toggleGroup(`__income_${key}`)}
                >
                  <td className="px-4 py-2.5 font-semibold text-sm text-green-700 dark:text-green-400">
                    <div className="flex items-center gap-2">
                      {hasEntries
                        ? isGroupCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />
                        : <span className="w-3.5" />
                      }
                      {idx === 0 && <TrendingUp className="w-3.5 h-3.5" />}
                      {label}
                    </div>
                  </td>
                  <td colSpan={2} />
                  <td className="px-4 py-2.5 text-right">
                    {groupTotal > 0
                      ? <span className="tabular-nums text-green-600 dark:text-green-400 font-medium">{fmtBudget(groupTotal)}</span>
                      : <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Received</span>
                    }
                  </td>
                  <td />
                </tr>
                {!isGroupCollapsed && hasEntries && Object.entries(byPayee)
                  .sort(([, a], [, b]) => b - a)
                  .map(([payee, amount]) => (
                    <tr key={payee} className="border-t border-border/30 hover:bg-muted/10">
                      <td className="px-4 py-2 pl-10 text-sm text-muted-foreground">{payee}</td>
                      <td colSpan={2} />
                      <td className="px-4 py-2 text-right tabular-nums text-green-600 dark:text-green-400 font-medium">
                        {fmtBudget(amount)}
                      </td>
                      <td />
                    </tr>
                  ))
                }
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Transaction Dialog ────────────────────────────────────────────────────────

function AddTransactionDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"expense" | "income" | "transfer">("expense");

  // Regular transaction state
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedEnvelope, setSelectedEnvelope] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [incomeCategory, setIncomeCategory] = useState<"income" | "cashback" | "starting_balance">("income");

  // Transfer state
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [transferNotes, setTransferNotes] = useState("");

  const { data: accountsData } = useAccounts();
  const { selectedMonth, defaultCurrency } = useAppStore();
  const { data: envelopesData } = useEnvelopes(selectedMonth);
  const allEnvelopes = (envelopesData as any)?.envelopes ?? [];
  const { mutate: createTxn, isPending } = useCreateTransaction();
  const { mutate: createTransfer, isPending: transferring } = useCreateTransfer();

  const accounts = accountsData?.accounts ?? [];
  const selectedAcc = accounts.find((a: any) => a.id === selectedAccount);
  const selectedCurrency = selectedAcc?.currency ?? defaultCurrency;
  const fromAcc = accounts.find((a: any) => a.id === fromAccount);
  const toAcc = accounts.find((a: any) => a.id === toAccount);
  const sameCurrency = fromAcc && toAcc && fromAcc.currency === toAcc.currency;

  const reset = () => {
    setPayee(""); setAmount(""); setDate(new Date().toISOString().slice(0, 10));
    setSelectedEnvelope(""); setSelectedAccount(""); setIncomeCategory("income");
    setFromAccount(""); setToAccount(""); setFromAmount(""); setToAmount("");
    setTransferDate(new Date().toISOString().slice(0, 10)); setTransferNotes("");
  };

  const envelopesByGroup = (allEnvelopes as any[]).reduce<{ groupId: string; groupName: string; items: any[] }[]>((acc: { groupId: string; groupName: string; items: any[] }[], env: any) => {
    const existing = acc.find(g => g.groupId === env.group_id);
    if (existing) existing.items.push(env);
    else acc.push({ groupId: env.group_id, groupName: env.group_name ?? "Other", items: [env] });
    return acc;
  }, []);

  const submitRegular = () => {
    if (!payee.trim() || !amount || !selectedAccount) return;
    createTxn({
      account_id: selectedAccount,
      envelope_id: selectedEnvelope || undefined,
      payee: payee.trim(),
      amount: parseFloat(amount),
      type: tab as "income" | "expense",
      date,
      ...(tab === "income" ? { income_category: incomeCategory } : {}),
    }, {
      onSuccess: () => { toast.success("Transaction added"); setOpen(false); reset(); },
      onError: e => toast.error(e.message),
    });
  };

  const submitTransfer = () => {
    if (!fromAccount || !toAccount || !fromAmount) return;
    if (fromAccount === toAccount) { toast.error("From and To accounts must be different"); return; }
    createTransfer({
      from_account_id: fromAccount,
      to_account_id: toAccount,
      amount: parseFloat(fromAmount),
      to_amount: sameCurrency ? parseFloat(fromAmount) : parseFloat(toAmount || fromAmount),
      date: transferDate,
      notes: transferNotes || undefined,
    }, {
      onSuccess: () => { toast.success("Transfer recorded"); setOpen(false); reset(); },
      onError: e => toast.error(e.message),
    });
  };

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><PlusCircle className="w-4 h-4 mr-1" />Add Transaction</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>

        {/* Tab bar */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(["expense", "income", "transfer"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 capitalize font-medium transition-colors ${tab === t ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab !== "transfer" ? (
          <div className="space-y-3 pt-1">
            <div>
              <Label>Account</Label>
              <select value={selectedAccount} onChange={e => { setSelectedAccount(e.target.value); setAmount(""); }} className={sel}>
                <option value="">Select account</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
            <div><Label>Payee</Label><Input value={payee} onChange={e => setPayee(e.target.value)} placeholder={tab === "income" ? "e.g. Employer" : "e.g. Coffee Shop"} className="mt-1" /></div>
            <div>
              <Label>Amount <span className="text-muted-foreground font-normal text-xs">({selectedCurrency})</span></Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={selectedCurrency === "INR" ? "5000" : "100"} className="mt-1" />
              {selectedAcc && selectedCurrency !== "INR" && (
                <p className="text-xs text-muted-foreground mt-1">Enter the amount in <strong>{selectedCurrency}</strong> — the INR equivalent will be computed automatically using stored exchange rates.</p>
              )}
            </div>
            {tab === "expense" && (
              <div>
                <Label>Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <select value={selectedEnvelope} onChange={e => setSelectedEnvelope(e.target.value)} className={sel}>
                  <option value="">Uncategorised</option>
                  {envelopesByGroup.map(({ groupId, groupName, items }) => (
                    <optgroup key={groupId} label={groupName}>
                      {items.map((env: any) => <option key={env.id} value={env.id}>{env.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            {tab === "income" && (
              <div>
                <Label>Category</Label>
                <select value={incomeCategory} onChange={e => setIncomeCategory(e.target.value as any)} className={sel}>
                  <option value="income">Income</option>
                  <option value="cashback">Cashback</option>
                  <option value="starting_balance">Starting Balance</option>
                </select>
              </div>
            )}
            <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
            <Button className="w-full" onClick={submitRegular} disabled={isPending || !payee.trim() || !amount || !selectedAccount}>Add {tab}</Button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div>
              <Label>From account</Label>
              <select value={fromAccount} onChange={e => setFromAccount(e.target.value)} className={sel}>
                <option value="">Select account</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
            <div>
              <Label>To account</Label>
              <select value={toAccount} onChange={e => setToAccount(e.target.value)} className={sel}>
                <option value="">Select account</option>
                {accounts.filter((a: any) => a.id !== fromAccount).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
            <div>
              <Label>Amount {fromAcc ? `(${fromAcc.currency})` : ""}</Label>
              <Input type="number" value={fromAmount} onChange={e => { setFromAmount(e.target.value); if (sameCurrency) setToAmount(e.target.value); }} placeholder="1000" className="mt-1" />
            </div>
            {!sameCurrency && fromAcc && toAcc && (
              <div>
                <Label>Received amount ({toAcc.currency})</Label>
                <Input type="number" value={toAmount} onChange={e => setToAmount(e.target.value)} placeholder="e.g. 1.08 for 1 USD→EUR" className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Enter the actual amount received in {toAcc.currency}</p>
              </div>
            )}
            <div><Label>Date</Label><Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="mt-1" /></div>
            <div><Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="e.g. Monthly transfer" className="mt-1" /></div>
            <Button className="w-full" onClick={submitTransfer}
              disabled={transferring || !fromAccount || !toAccount || !fromAmount || (!sameCurrency && !toAmount && !!(fromAcc && toAcc))}>
              Record transfer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Recurring Panel ─────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };

function AddRecurringDialog({ accounts, envelopes, onAdd }: { accounts: any[]; envelopes: any[]; onAdd: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [envelopeId, setEnvelopeId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDate, setNextDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  const submit = () => {
    if (!payee.trim() || !amount || !accountId) return;
    onAdd({ payee: payee.trim(), amount: parseFloat(amount), type, account_id: accountId, envelope_id: envelopeId || null, frequency, next_date: nextDate, end_date: endDate || null, notes: notes || null });
    setOpen(false);
    setPayee(""); setAmount(""); setNotes(""); setEndDate("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><PlusCircle className="w-3 h-3" />Add Recurring</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Recurring Transaction</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div><Label>Payee</Label><Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Netflix" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Type</Label><select value={type} onChange={e => setType(e.target.value as any)} className={sel}><option value="expense">Expense</option><option value="income">Income</option></select></div>
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1000" className="mt-1" /></div>
          </div>
          <div><Label>Account</Label><select value={accountId} onChange={e => setAccountId(e.target.value)} className={sel}>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><Label>Category <span className="text-muted-foreground font-normal">(optional)</span></Label><select value={envelopeId} onChange={e => setEnvelopeId(e.target.value)} className={sel}><option value="">None</option>{envelopes.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Frequency</Label><select value={frequency} onChange={e => setFrequency(e.target.value)} className={sel}>{Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><Label>First date</Label><Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>End date <span className="text-muted-foreground font-normal">(optional)</span></Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1" /></div>
          <div><Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" /></div>
          <Button className="w-full" onClick={submit} disabled={!payee.trim() || !amount || !accountId}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringPanel({ recurring, accounts, envelopes, onDelete, fmtBudget }: {
  recurring: any[]; accounts: any[]; envelopes: any[];
  onDelete: (id: string) => void; fmtBudget: (n: number) => string;
}) {
  const { mutate: createRecurring } = useCreateRecurring();
  const accountNameById = Object.fromEntries(accounts.map((a: any) => [a.id, a.name]));

  if (recurring.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <AddRecurringDialog accounts={accounts} envelopes={envelopes} onAdd={data => createRecurring(data, { onSuccess: () => toast.success("Recurring transaction added"), onError: e => toast.error(e.message) })} />
        </div>
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium mb-1">No recurring transactions</p>
          <p className="text-xs">Add salary, rent, subscriptions — they'll be logged automatically each period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddRecurringDialog accounts={accounts} envelopes={envelopes} onAdd={data => createRecurring(data, { onSuccess: () => toast.success("Recurring transaction added"), onError: e => toast.error(e.message) })} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payee</TableHead>
            <TableHead>Next</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {recurring.map((r: any) => (
            <TableRow key={r.id} className={r.is_active ? "" : "opacity-40"}>
              <TableCell>
                <div className="text-sm font-medium">{r.payee}</div>
                <div className="text-xs text-muted-foreground">{FREQ_LABELS[r.frequency]} · {accountNameById[r.account_id] ?? r.account_id}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.next_date}</TableCell>
              <TableCell className={`text-right text-sm font-medium tabular-nums ${r.type === "income" ? "text-green-600" : "text-red-500"}`}>
                {r.type === "income" ? "+" : "−"}{fmtBudget(r.amount)}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onDelete(r.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const { selectedMonth, defaultCurrency } = useAppStore();
  const { data: envelopesData, isLoading: envLoading, error: envError } = useEnvelopes(selectedMonth);
  const { data: groupsData, isLoading: groupsLoading } = useEnvelopeGroups();
  const { data: summary } = useMonthlySummary(selectedMonth);
  const { data: accountsData } = useAccounts();
  const { data: rates = {} } = useExchangeRates();
  const { mutate: createAccount, isPending: creatingAccount } = useCreateAccount();
  const { mutate: createGroup, isPending: creatingGroup } = useCreateEnvelopeGroup();

  // Converts an INR amount to the user's global default currency and formats it
  const fmtBudget = (amountInr: number) =>
    formatCurrency(convertFromINR(amountInr, defaultCurrency as any, rates), defaultCurrency as any);

  const allEnvelopes: any[] = (envelopesData as any)?.envelopes ?? [];
  const groups: { id: string; name: string; sort_order: number }[] = groupsData?.groups ?? [];

  const INCOME_GROUP_NAMES = new Set(["Income", "Cashback", "Starting Balances"]);

  // Group envelopes by group_id — exclude income groups (rendered separately below)
  const groupedEnvelopes = groups
    .filter(g => !INCOME_GROUP_NAMES.has(g.name))
    .map(g => ({
      group: g,
      envelopes: allEnvelopes.filter(e => e.group_id === g.id),
    }));
  // Orphaned envelopes (no matching group in current list) — shouldn't normally happen
  const orphaned = allEnvelopes.filter(e => !groups.find(g => g.id === e.group_id));

  const incomeGroupIds = new Set(groups.filter(g => INCOME_GROUP_NAMES.has(g.name)).map(g => g.id));

  // To Budget = income received this month − total already assigned to envelopes (in INR)
  // Exclude income groups — they don't consume budget
  const totalBudgeted = allEnvelopes
    .filter(e => !incomeGroupIds.has(e.group_id))
    .reduce((s, e) => s + (e.budgeted_inr ?? e.budgeted), 0);
  const carryover = summary?.carryover_from_previous ?? 0;
  const toBudget = summary ? summary.total_income + carryover - totalBudgeted : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget</h1>
          {summary && (
            <p className="text-sm text-muted-foreground mt-1">
              Income: <span className="text-green-600 font-medium">{fmtBudget(summary.total_income)}</span>
              {" · "}
              Expenses: <span className="text-red-500 font-medium">{fmtBudget(summary.total_expenses)}</span>
              {" · "}
              Net: <span className="font-medium">{fmtBudget(summary.net)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector />
          <AccountDialog
            title="New Account"
            trigger={<Button size="sm" variant="outline"><PlusCircle className="w-4 h-4 mr-1" />Add Account</Button>}
            isPending={creatingAccount}
            onSubmit={data => createAccount(data as any, { onSuccess: () => toast.success("Account created"), onError: e => toast.error(e.message) })}
          />
          <AddTransactionDialog />
        </div>
      </div>

      {/* Accounts strip — on-budget accounts only */}
      {accountsData && accountsData.accounts.length > 0 && (() => {
        const onBudget = accountsData.accounts.filter((a: any) => !a.off_budget);
        if (onBudget.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-3">
            {onBudget.map((a: any) => <AccountTransactionsDialog key={a.id} account={a} />)}
          </div>
        );
      })()}

      {/* Investment / savings accounts strip */}
      {accountsData && (() => {
        const offBudget = accountsData.accounts.filter(
          (a: any) => a.off_budget && (a.type === "investment" || a.type === "savings")
        );
        if (offBudget.length === 0) return null;
        return (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Investment Accounts</p>
            <div className="flex flex-wrap gap-3">
              {offBudget.map((a: any) => <AccountTransactionsDialog key={a.id} account={a} />)}
            </div>
          </div>
        );
      })()}

      {/* To Budget banner */}
      {toBudget !== null && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
          toBudget > 0
            ? "bg-green-500/10 border-green-500/30"
            : toBudget < 0
            ? "bg-red-500/10 border-red-500/30"
            : "bg-muted/50 border-border"
        }`}>
          <div>
            <p className="text-sm font-semibold">
              {toBudget > 0 ? "Ready to assign" : toBudget < 0 ? "Over-budgeted" : "Fully assigned"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {toBudget > 0
                ? `${fmtBudget(toBudget)} available${carryover > 0 ? ` (incl. ${fmtBudget(carryover)} from previous months)` : ""}`
                : toBudget < 0
                ? `You've budgeted ${fmtBudget(-toBudget)} more than you've received${carryover < 0 ? ` (incl. ${fmtBudget(-carryover)} over-budgeted in prior months)` : ""}`
                : "Every unit of income is assigned — nice!"}
            </p>
          </div>
          <span className={`text-xl font-bold tabular-nums ${toBudget > 0 ? "text-green-600 dark:text-green-400" : toBudget < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {fmtBudget(Math.abs(toBudget))}
          </span>
        </div>
      )}

      {/* Envelope columns */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Envelopes</h2>
          <AddCategoryDialog onAdd={(name) => createGroup(name, {
            onSuccess: () => toast.success(`Category "${name}" created`),
            onError: e => toast.error(e.message),
          })} isPending={creatingGroup} />
        </div>

        {envError && (
          <Alert variant="destructive"><AlertDescription>Failed to load envelopes.</AlertDescription></Alert>
        )}

        {(envLoading || groupsLoading) ? (
          <div className="rounded-lg border overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24 ml-auto" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm border rounded-lg">
            <p className="font-medium mb-1">No categories yet</p>
            <p className="text-xs">Click "Add Category" to create your first one (e.g. Needs, Wants, Savings).</p>
          </div>
        ) : (
          <>
            <BudgetTable
              groupedEnvelopes={groupedEnvelopes}
              selectedMonth={selectedMonth}
              groups={groups}
              fmtBudget={fmtBudget}
            />
            {orphaned.length > 0 && (
              <div className="text-xs text-muted-foreground px-1">
                {orphaned.length} uncategorised envelope{orphaned.length > 1 ? "s" : ""} hidden.
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
