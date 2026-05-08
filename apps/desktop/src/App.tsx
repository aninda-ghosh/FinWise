import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { LoginGate } from "@/components/LoginGate";

import { queryClient } from "@/lib/query-client";
import { getToken } from "@/lib/api";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";
import "./App.css";

const DashboardPage = lazy(() => import("@/modules/dashboard/pages/DashboardPage"));
const BudgetPage = lazy(() => import("@/modules/budget/pages/BudgetPage"));
const TransactionsPage = lazy(() => import("@/modules/transactions/pages/TransactionsPage"));
const InvestmentsPage = lazy(() => import("@/modules/investments/pages/InvestmentsPage"));
const PoliciesPage = lazy(() => import("@/modules/policies/pages/PoliciesPage"));
const ChatPage = lazy(() => import("@/modules/chat/pages/ChatPage"));
const DebtPage = lazy(() => import("@/modules/debt/pages/DebtPage"));
const SettingsPage = lazy(() => import("@/modules/settings/pages/SettingsPage"));
const FAQPage = lazy(() => import("@/modules/faq/pages/FAQPage"));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
    </div>
  );
}

function ThemeSync() {
  const resolved = useResolvedTheme();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");

    const favicon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (favicon) {
      favicon.href = resolved === "dark" ? "/Finwise-Dark.png" : "/Finwise-Light.png";
    }
  }, [resolved]);

  return null;
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => !!getToken());

  if (!unlocked) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeSync />
        <LoginGate onUnlocked={() => setUnlocked(true)} />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <BrowserRouter>
        <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden pt-[env(safe-area-inset-top)]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/budget" element={<BudgetPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/investments" element={<InvestmentsPage />} />
                <Route path="/debt" element={<DebtPage />} />
                <Route path="/policies" element={<PoliciesPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/faq" element={<FAQPage />} />
              </Routes>
            </Suspense>
          </main>
          <BottomNav />
        </div>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
