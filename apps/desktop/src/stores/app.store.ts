import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  selectedMonth: string;
  sidebarCollapsed: boolean;
  theme: "light" | "dark" | "system";
  defaultCurrency: string;
  aiModel: string;
  setSelectedMonth: (month: string) => void;
  toggleSidebar: () => void;
  setTheme: (theme: AppState["theme"]) => void;
  setDefaultCurrency: (currency: string) => void;
  setAiModel: (model: string) => void;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedMonth: currentMonth(),
      sidebarCollapsed: false,
      theme: "system",
      defaultCurrency: "USD",
      aiModel: "gemma4:e2b",
      setSelectedMonth: (month) => set({ selectedMonth: month }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setDefaultCurrency: (currency) => set({ defaultCurrency: currency }),
      setAiModel: (model) => set({ aiModel: model }),
    }),
    { name: "finwise-app" }
  )
);
