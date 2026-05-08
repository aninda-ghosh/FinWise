import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency, convertFromINR } from "@finwise/shared/utils";
import { useAppStore } from "@/stores/app.store";
import { useExchangeRates } from "@/modules/budget/hooks/useBudget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, PlusCircle, Trash2, CreditCard } from "lucide-react";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useTransactions,
  useCreateTransfer,
} from "@/modules/budget/hooks/useBudget";

// ─── Add / Edit Debt Account Dialog ──────────────────────────────────────────

function DebtAccountDialog({
  trigger,
  title,
  initial,
  onSubmit,
  isPending,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: { name: string; type: string; currency: string; amountOwed: number; institution: string };
  onSubmit: (data: { name: string; type: "credit" | "loan"; currency: string; balance: number; institution?: string; off_budget: boolean }) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<"credit" | "loan">(initial?.type === "loan" ? "loan" : "credit");
  const [currency, setCurrency] = useState(initial?.currency ?? "INR");
  const [amountOwed, setAmountOwed] = useState(initial?.amountOwed != null ? String(initial.amountOwed) : "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");

  const reset = () => {
    setName(initial?.name ?? "");
    setType(initial?.type === "loan" ? "loan" : "credit");
    setCurrency(initial?.currency ?? "INR");
    setAmountOwed(initial?.amountOwed != null ? String(initial.amountOwed) : "");
    setInstitution(initial?.institution ?? "");
  };

  const sel = "w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background";

  const submit = () => {
    if (!name.trim() || !amountOwed) return;
    onSubmit({
      name: name.trim(),
      type,
      currency,
      balance: -(parseFloat(amountOwed) || 0), // store as negative (liability)
      institution: institution.trim() || undefined,
      off_budget: true,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Car Loan, HDFC Credit Card" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select value={type} onChange={e => setType(e.target.value as "credit" | "loan")} className={sel}>
                <option value="loan">Loan</option>
                <option value="credit">Credit Card</option>
              </select>
            </div>
            <div>
              <Label>Currency</Label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={sel}>
                {["INR", "USD", "SGD", "NTD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Current Amount Owed ({currency})</Label>
            <Input
              type="number"
              value={amountOwed}
              onChange={e => setAmountOwed(e.target.value)}
              placeholder="e.g. 500000"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Enter the outstanding balance you currently owe.</p>
          </div>
          <div>
            <Label>Institution <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="e.g. HDFC Bank" className="mt-1" />
          </div>
          <Button className="w-full" onClick={submit} disabled={isPending || !name.trim() || !amountOwed}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Make Payment Dialog ──────────────────────────────────────────────────────

function PaymentDialog({ debtAccount, budgetAccounts, trigger }: {
  debtAccount: any;
  budgetAccounts: any[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [fromAccount, setFromAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const { mutate: createTransfer, isPending } = useCreateTransfer();

  const reset = () => { setFromAccount(""); setAmount(""); setDate(new Date().toISOString().slice(0, 10)); setNotes(""); };

  const submit = () => {
    if (!fromAccount || !amount) return;
    createTransfer(
      {
        from_account_id: fromAccount,
        to_account_id: debtAccount.id,
        amount: parseFloat(amount),
        date,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => { toast.success("Payment recorded"); setOpen(false); reset(); },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Make Payment — {debtAccount.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Pay From</Label>
            <select value={fromAccount} onChange={e => setFromAccount(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background">
              <option value="">Select account…</option>
              {budgetAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Amount ({debtAccount.currency})</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Monthly EMI" className="mt-1" />
          </div>
          <Button className="w-full" onClick={submit} disabled={isPending || !fromAccount || !amount}>
            Record Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction History Sheet ────────────────────────────────────────────────

function TransactionSheet({ account, open, onOpenChange }: { account: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data } = useTransactions({ account_id: account.id, limit: 100 });
  const txns = data?.transactions ?? [];
  const amountOwed = Math.abs(account.balance);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[580px] sm:max-w-none flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0 pr-14">
          <SheetTitle className="text-lg">{account.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Amount owed:{" "}
            <span className="font-semibold text-red-500">{formatCurrency(amountOwed, account.currency)}</span>
            <span className="ml-2 text-xs bg-muted rounded px-1.5 py-0.5">{account.currency}</span>
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No transactions recorded yet.</p>
          ) : (
            <div className="divide-y">
              {txns.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.payee}</p>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums ml-4 ${t.type === "transfer" ? "text-blue-500" : t.type === "income" ? "text-green-600" : "text-red-500"}`}>
                    {t.type === "transfer" ? (t.payee === "Transfer in" ? "+" : "−") : t.type === "income" ? "+" : "−"}
                    {formatCurrency(t.amount, account.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DebtPage() {
  const { data: accountsData, isLoading } = useAccounts();
  const { mutate: createAccount, isPending: creating } = useCreateAccount();
  const { mutate: updateAccount, isPending: updating } = useUpdateAccount();
  const { mutate: deleteAccount } = useDeleteAccount();
  const [sheetAccount, setSheetAccount] = useState<any | null>(null);

  const defaultCurrency = useAppStore(s => s.defaultCurrency);
  const { data: rates = {} } = useExchangeRates();
  const fmt = (inr: number) => formatCurrency(convertFromINR(inr, defaultCurrency as any, rates), defaultCurrency as any);

  const allAccounts = accountsData?.accounts ?? [];
  const debtAccounts = allAccounts.filter((a: any) => a.type === "credit" || a.type === "loan");
  const budgetAccounts = allAccounts.filter((a: any) => !a.off_budget);

  const totalDebtInr = debtAccounts.reduce((s: number, a: any) => s + Math.abs(a.balance_inr), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Debt</h1>
          {debtAccounts.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Total owed: <span className="font-semibold text-red-500">{fmt(totalDebtInr)}</span>
            </p>
          )}
        </div>
        <DebtAccountDialog
          title="Add Debt Account"
          trigger={<Button size="sm"><PlusCircle className="w-4 h-4 mr-1.5" />Add Debt</Button>}
          isPending={creating}
          onSubmit={data => createAccount(data as any, {
            onSuccess: () => toast.success("Debt account added"),
            onError: e => toast.error(e.message),
          })}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : debtAccounts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm space-y-2">
          <CreditCard className="w-10 h-10 mx-auto opacity-20" />
          <p>No debt accounts yet.</p>
          <p className="text-xs">Add a loan or credit card to track what you owe and make payments.</p>
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-sm">Accounts</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount Owed</th>
                  <th className="w-40 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {debtAccounts.map((a: any) => {
                  const amountOwed = Math.abs(a.balance);
                  const amountOwedInr = Math.abs(a.balance_inr);
                  const isINR = a.currency === "INR";
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-muted/20 transition-colors group cursor-pointer"
                      onClick={() => setSheetAccount(a)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{a.name}</div>
                        {a.institution && <div className="text-xs text-muted-foreground">{a.institution}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs capitalize">{a.type}</Badge>
                        <div className="text-xs text-muted-foreground mt-0.5">{a.currency}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold tabular-nums text-red-500">{formatCurrency(amountOwed, a.currency)}</div>
                        {!isINR && <div className="text-xs text-muted-foreground tabular-nums">≈ {fmt(amountOwedInr)}</div>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1.5 justify-end">
                          <PaymentDialog
                            debtAccount={a}
                            budgetAccounts={budgetAccounts}
                            trigger={
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                Make Payment
                              </Button>
                            }
                          />
                          <DebtAccountDialog
                            title="Edit Debt Account"
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Pencil className="w-3 h-3" />
                              </Button>
                            }
                            isPending={updating}
                            initial={{ name: a.name, type: a.type, currency: a.currency, amountOwed: Math.abs(a.balance), institution: a.institution ?? "" }}
                            onSubmit={data => updateAccount(
                              { id: a.id, data: { name: data.name, balance: data.balance } },
                              {
                                onSuccess: () => toast.success("Updated"),
                                onError: e => toast.error(e.message),
                              }
                            )}
                          />
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteAccount(a.id, {
                              onSuccess: () => toast.success("Deleted"),
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
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-red-500">{fmt(totalDebtInr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {sheetAccount && (
        <TransactionSheet
          account={sheetAccount}
          open={!!sheetAccount}
          onOpenChange={open => { if (!open) setSheetAccount(null); }}
        />
      )}
    </div>
  );
}
