import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/stores/app.store";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Server, Upload, XCircle, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, BASE_URL, getToken } from "@/lib/api";

const CHANGELOG: { version: string; date: string; sections: { label: string; items: string[] }[] }[] = [
  {
    version: "0.7.2-beta",
    date: "2026-05-08",
    sections: [
      {
        label: "Added",
        items: [
          "PWA support — install from Safari via 'Add to Home Screen'. Runs in standalone mode; all navigation stays inside the app shell instead of breaking out to Safari.",
        ],
      },
      {
        label: "Fixed",
        items: [
          "JWT token not persisting across page refreshes — login screen no longer appears after a refresh when a valid token is already stored.",
          "Expired token now cleanly logs you out instead of leaving the app in a broken state.",
          "Smaller UI on mobile — root font size reduced to 14 px on small screens so all text and spacing scales down proportionally.",
          "PWA top overlap fixed — app content now starts below the Dynamic Island / status bar using env(safe-area-inset-top).",
          "PWA zoom prevented — maximum-scale=1.0 stops iOS from scaling up content in standalone mode.",
        ],
      },
    ],
  },
  {
    version: "0.7.1-beta",
    date: "2026-05-08",
    sections: [
      {
        label: "Added",
        items: [
          "Auto-heal sidecar — willfarrell/autoheal monitors all containers every 30 s and restarts any that become unhealthy, covering cases that restart: unless-stopped misses.",
        ],
      },
      {
        label: "Fixed",
        items: [
          "AI Chat SSE stream cut off (ERR_INCOMPLETE_CHUNKED_ENCODING) — Nginx now forwards tokens to the browser immediately with proxy_buffering off on the /api/ai/chat route.",
          "Ollama healthcheck now uses 'ollama list' instead of a raw HTTP check, with a longer start period to handle slow first-start initialization.",
        ],
      },
    ],
  },
  {
    version: "0.7.0-beta",
    date: "2026-05-08",
    sections: [
      {
        label: "Added",
        items: [
          "Ollama runs as a Docker service — no host installation required. Models persist in a named volume.",
          "deploy.sh — validates required env vars, builds, starts all services, and prints access URLs.",
        ],
      },
      {
        label: "Changed",
        items: [
          "OLLAMA_URL now defaults to http://ollama:11434 (Docker internal DNS) instead of host.docker.internal.",
        ],
      },
    ],
  },
  {
    version: "0.6.0-beta",
    date: "2026-05-08",
    sections: [
      {
        label: "Added",
        items: [
          "Mobile bottom navigation bar — Dashboard, Budget, Transactions, AI Chat, and a More sheet for the rest. Respects iOS safe-area insets.",
        ],
      },
      {
        label: "Fixed",
        items: [
          "iOS Safari viewport cutoff — switched root layout to dynamic viewport height (100dvh) so content is no longer clipped by the browser chrome.",
          "Sidebar hidden on mobile — full viewport width given to content on small screens.",
          "Responsive grids on Dashboard — all stat rows and content grids now collapse to 1–2 columns on mobile.",
          "Horizontally scrollable tables on mobile — Budget, Transactions, Debt, Investments, and Policies tables no longer overflow the screen.",
          "Full-width sheets on mobile — account and transaction sheets now fill the screen instead of overflowing.",
          "Chat and Transactions pages clear the bottom nav — input bar and pagination are no longer hidden behind the navigation bar.",
          "Server crash when clicking 'Start Ollama' in Docker — unhandled ENOENT spawn error no longer kills the server process.",
        ],
      },
    ],
  },
  {
    version: "0.5.0-beta",
    date: "2026-05-07",
    sections: [
      {
        label: "Added",
        items: [
          "App screenshots — ten screenshots covering all major modules added to the repository and README.",
        ],
      },
      {
        label: "Changed",
        items: [
          "README fully rewritten — prerequisites section, inline .env values in Quick Start, split Mac/Linux Ollama instructions, updated project structure.",
        ],
      },
      {
        label: "Infrastructure",
        items: [
          "Public release — repository open-sourced on GitHub with a clean git history.",
          "Project cleaned up — extras/, docs/, .github/, and scripts/ removed from the tree.",
        ],
      },
    ],
  },
  {
    version: "0.4.1-beta",
    date: "2026-05-06",
    sections: [
      {
        label: "Changed",
        items: [
          "Frontend port changed from 8080 to 3002 — updated across all compose files, .env.example, README, and docs. Backend stays on 3001.",
        ],
      },
      {
        label: "Infrastructure",
        items: [
          "Repository open-sourced — migration exports and personal data excluded, fresh git history.",
          ".env.example updated to reflect current environment variables.",
        ],
      },
    ],
  },
  {
    version: "0.4.0-beta",
    date: "2026-05-05",
    sections: [
      {
        label: "Added",
        items: [
          "Backup & Restore in Settings — export all financial data as a JSON file and restore from it with a single click.",
          "Production Docker Compose (docker-compose.prod.yml) for self-hosted deployment.",
          "GitHub Actions CI — Biome lint check runs on every push and pull request.",
          "Theme-aware logo — sidebar switches between dark and light logo variants based on the active theme.",
        ],
      },
      {
        label: "Security",
        items: [
          "JWT_SECRET is now required at startup — the server refuses to start if the variable is not set.",
        ],
      },
      {
        label: "Fixed",
        items: [
          "AI Chat 401 errors — replaced EventSource (no custom headers) with a fetch-based SSE reader that sends the Authorization token.",
          "Editing an account's type or currency was silently ignored — both fields are now included in the update schema.",
          "Portfolio summary and net worth now correctly include both investment holdings and linked off-budget account balances.",
        ],
      },
    ],
  },
  {
    version: "0.3.0-beta",
    date: "2026-05-02",
    sections: [
      {
        label: "Added",
        items: [
          "Investment account linking from Investments page — create a real off-budget account directly from the Linked Accounts section.",
          "Transfer tab in Linked Account sheet — move money to/from investment accounts without switching to Budget.",
          "Investment Accounts strip on Budget page — off-budget savings and investment accounts appear as clickable cards below the regular account strip.",
          "Debt module — track credit cards and loans; debt is subtracted from net worth on the Dashboard.",
          "Changelog viewer in Settings.",
        ],
      },
      {
        label: "Changed",
        items: [
          "Help & FAQ page fully rewritten to match the actual state of the app (PostgreSQL storage, correct currency lists, accurate settings paths, Debt and Active Month sections added).",
          "Settings version badge now reads from package.json — sidebar and Settings always show the same version.",
        ],
      },
      {
        label: "Fixed",
        items: [
          "Investment holdings (Add Investment) and transferable linked accounts are now clearly distinct, with an empty-state explanation in the Linked Accounts section.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-02",
    sections: [
      {
        label: "Changed — Architecture",
        items: [
          "Switched database from SQLite/SQLCipher to PostgreSQL 16.",
          "Removed Tauri desktop app — now a pure web app served by Nginx + Docker Compose.",
          "Replaced password-as-DB-key auth with JWT auth (PBKDF2-SHA512 + HMAC-SHA256, 30-day tokens).",
          "Schema migrations run automatically on server startup.",
        ],
      },
      {
        label: "Added",
        items: [
          "JWT_SECRET environment variable for signing tokens.",
          "Currency enum expanded to full 11-currency set (INR, USD, SGD, GBP, EUR, AUD, JPY, TWD, HKD, CAD, NTD).",
        ],
      },
      {
        label: "Removed",
        items: [
          "better-sqlite3-multiple-ciphers and related dependencies.",
          "FINWISE_DB_KEY and DB_PATH environment variables.",
          "db/key-manager.ts — DB key derivation from macOS Keychain.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-04-01",
    sections: [
      {
        label: "Added — Initial release",
        items: [
          "Envelope budgeting with monthly rollover.",
          "Multi-currency accounts with live exchange rates via open.er-api.com.",
          "CSV transaction import with SHA-256 deduplication.",
          "Recurring transactions (weekly / monthly / quarterly / annual).",
          "Investment portfolio tracking (mutual funds, stocks, ETFs, FDs, bonds, real estate, cash, structured, savings).",
          "Insurance policy manager with premium schedule and payout timeline.",
          "AI Chat powered by local Ollama with conversation history.",
          "Dark / light / system theme toggle.",
          "Debt page.",
          "FAQ page.",
          "Dockerized deployment (server + Nginx frontend).",
        ],
      },
    ],
  },
];

const LABEL_COLORS: Record<string, string> = {
  "Added": "text-green-600 dark:text-green-400",
  "Added — Initial release": "text-green-600 dark:text-green-400",
  "Changed": "text-blue-600 dark:text-blue-400",
  "Changed — Architecture": "text-blue-600 dark:text-blue-400",
  "Fixed": "text-yellow-600 dark:text-yellow-400",
  "Removed": "text-red-500",
  "Security": "text-orange-600 dark:text-orange-400",
  "Infrastructure": "text-purple-600 dark:text-purple-400",
};

function ChangelogDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ScrollText className="w-3.5 h-3.5" />
          View Changelog
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Changelog</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto space-y-6 pr-1">
          {CHANGELOG.map(release => (
            <div key={release.version}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="font-mono text-xs">{release.version}</Badge>
                <span className="text-xs text-muted-foreground">{release.date}</span>
              </div>
              <div className="space-y-3">
                {release.sections.map(section => (
                  <div key={section.label}>
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${LABEL_COLORS[section.label] ?? "text-muted-foreground"}`}>
                      {section.label}
                    </p>
                    <ul className="space-y-1">
                      {section.items.map((item, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let offset = -11; offset <= 1; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    options.push({
      value: `${year}-${month}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return options.reverse();
}

function ServerStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch("/api/auth/status")
      .then(r => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="w-4 h-4" /> API Server
        </CardTitle>
        <CardDescription>Hono API — PostgreSQL backend</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {status === "checking" && <span className="text-xs text-muted-foreground animate-pulse">Checking…</span>}
          {status === "online" && <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm text-green-600 dark:text-green-400 font-medium">Online</span></>}
          {status === "offline" && <><XCircle className="w-4 h-4 text-red-500" /><span className="text-sm text-red-600 dark:text-red-400 font-medium">Offline</span></>}
        </div>
      </CardContent>
    </Card>
  );
}

function ExchangeRatesCard() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRates, setLastRates] = useState<{ from_currency: string; rate_to_inr: number }[]>([]);

  useEffect(() => {
    apiFetch<any>("/api/exchange-rates").then(d => setLastRates(d.rates ?? [])).catch(() => {});
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch<any>("/api/exchange-rates/refresh", { method: "POST" });
      setLastRates(res.updated ?? []);
      toast.success(`Refreshed ${res.count} exchange rate${res.count !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Exchange rate refresh failed — check network");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exchange Rates</CardTitle>
        <CardDescription>Live rates from open.er-api.com — used to convert foreign investments to ₹</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastRates.length > 0 && (
          <div className="text-sm space-y-1">
            {lastRates.map(r => (
              <div key={r.from_currency} className="flex justify-between">
                <span className="text-muted-foreground">1 {r.from_currency}</span>
                <span className="font-medium">₹{r.rate_to_inr.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh rates"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DataBackupCard() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<Record<string, unknown[]> | null>(null);
  const [importing, setImporting] = useState(false);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/api/backup/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `finwise-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Export failed — check the server logs");
    } finally {
      setExporting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed?.data) throw new Error();
        setPendingBackup(parsed.data);
      } catch {
        toast.error("Invalid backup file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importBackup = async () => {
    if (!pendingBackup) return;
    setImporting(true);
    try {
      await apiFetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "1", data: pendingBackup }),
      });
      queryClient.invalidateQueries();
      toast.success("Backup restored — all data replaced");
      setPendingBackup(null);
    } catch {
      toast.error("Import failed — check the server logs");
    } finally {
      setImporting(false);
    }
  };

  const stats = pendingBackup
    ? [
        { label: "Accounts", count: pendingBackup.accounts?.length ?? 0 },
        { label: "Transactions", count: pendingBackup.transactions?.length ?? 0 },
        { label: "Envelopes", count: pendingBackup.envelopes?.length ?? 0 },
        { label: "Investments", count: pendingBackup.investments?.length ?? 0 },
        { label: "Policies", count: pendingBackup.policies?.length ?? 0 },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup & Restore</CardTitle>
        <CardDescription>Export all your data as a JSON file, or restore from a previous backup. Import replaces all existing data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={exportBackup} disabled={exporting} className="gap-2">
          <Download className="w-3.5 h-3.5" />
          {exporting ? "Exporting…" : "Export Backup"}
        </Button>

        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={onFileChange} />

        <Dialog open={!!pendingBackup} onOpenChange={(o) => { if (!o) setPendingBackup(null); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
              Import Backup
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" /> Restore from backup?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                This will <strong>replace all existing data</strong> with the contents of the backup file. This cannot be undone.
              </p>
              {stats.length > 0 && (
                <div className="rounded-md border p-3 space-y-1">
                  {stats.map((s) => (
                    <div key={s.label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full" disabled={importing} onClick={importBackup}>
                {importing ? "Restoring…" : "Restore Backup"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function DataResetCard() {
  const queryClient = useQueryClient();

  // ── Clear transactions only ───────────────────────────────────────────────
  const [txOpen, setTxOpen] = useState(false);
  const [txResetting, setTxResetting] = useState(false);

  const clearTransactions = async () => {
    setTxResetting(true);
    try {
      await apiFetch("/api/reset/transactions", { method: "POST" });
      queryClient.invalidateQueries();
      toast.success("Transactions cleared — accounts and envelopes are intact.");
      setTxOpen(false);
    } catch {
      toast.error("Clear failed — check the server logs.");
    } finally {
      setTxResetting(false);
    }
  };

  // ── Reset everything ──────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const PHRASE = "delete all my data";

  const reset = async () => {
    if (confirm !== PHRASE) return;
    setResetting(true);
    try {
      await apiFetch("/api/reset", { method: "POST" });
      queryClient.invalidateQueries();
      toast.success("All data deleted — the app is now fresh.");
      setOpen(false);
      setConfirm("");
    } catch {
      toast.error("Reset failed — check the server logs.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4" /> Danger Zone
        </CardTitle>
        <CardDescription>Permanently delete all your data — accounts, transactions, investments, policies, AI conversations, and everything else.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">

        {/* Level 1 — clear transactions only */}
        <Dialog open={txOpen} onOpenChange={setTxOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
              Clear Transactions
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Clear all transactions?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                This will delete all transactions and reset envelope budgets to <strong>$0</strong>. Your accounts, envelope groups, and envelope names will be kept intact.
              </p>
              <Button
                variant="destructive"
                className="w-full"
                disabled={txResetting}
                onClick={clearTransactions}
              >
                {txResetting ? "Clearing…" : "Clear Transactions"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Level 2 — nuke everything */}
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setConfirm(""); }}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">Reset All Data</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Are you absolutely sure?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                This will permanently delete <strong>everything</strong> — all accounts, transactions, envelopes, investments, policies, and AI chat history. This cannot be undone.
              </p>
              <div>
                <Label className="text-sm">
                  Type <span className="font-mono font-semibold text-foreground">{PHRASE}</span> to confirm
                </Label>
                <Input
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={PHRASE}
                  className="mt-2"
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={confirm !== PHRASE || resetting}
                onClick={reset}
              >
                {resetting ? "Deleting…" : "Delete Everything"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}

const SUPPORTED_CURRENCIES = [
  "INR", "USD", "SGD", "GBP", "EUR", "AUD", "JPY", "TWD", "HKD", "CAD", "NTD",
] as const;

export default function SettingsPage() {
  const { selectedMonth, setSelectedMonth, theme, setTheme, defaultCurrency, setDefaultCurrency } = useAppStore();
  const monthOptions = buildMonthOptions();

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Active Month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Month</CardTitle>
          <CardDescription>Budget and transaction views are filtered by this month.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="month-select">Selected Month</Label>
            <select
              id="month-select"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              {monthOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Currently viewing: <span className="font-medium text-foreground">{selectedMonth}</span></p>
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose your preferred color theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(["light", "dark", "system"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-2 rounded-md border text-sm font-medium capitalize transition-colors ${theme === t ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300" : "border-border hover:bg-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Default Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Currency</CardTitle>
          <CardDescription>Base currency for the entire app — all budget amounts, balances, and totals are displayed in this currency.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CURRENCIES.map(c => (
              <button
                key={c}
                onClick={() => setDefaultCurrency(c)}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${defaultCurrency === c ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300" : "border-border hover:bg-muted"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Current default: <span className="font-medium text-foreground">{defaultCurrency}</span></p>
        </CardContent>
      </Card>

      {/* Exchange rates */}
      <ExchangeRatesCard />

      {/* Server status */}
      <ServerStatus />

      {/* Backup & restore */}
      <DataBackupCard />

      {/* Data reset */}
      <DataResetCard />

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About Finwise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Version</span>
              <Badge variant="outline">{__APP_VERSION__}</Badge>
            </div>
            <ChangelogDialog />
          </div>
          <p>Personal finance manager. Your data is stored in PostgreSQL and stays within your own infrastructure.</p>
          <p>AI powered by <span className="font-medium text-foreground">Ollama gemma4:e4b</span> running locally.</p>
        </CardContent>
      </Card>
    </div>
  );
}
