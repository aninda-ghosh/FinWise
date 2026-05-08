import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, MessageSquare, Settings, Shield, TrendingUp,
  Wallet, ArrowLeftRight, HelpCircle, Landmark, MoreHorizontal, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budget",    label: "Budget",    icon: Wallet },
  { to: "/transactions", label: "Txns",  icon: ArrowLeftRight },
  { to: "/chat",      label: "AI Chat",   icon: MessageSquare },
];

const MORE_NAV = [
  { to: "/investments", label: "Investments", icon: TrendingUp },
  { to: "/debt",        label: "Debt",        icon: Landmark },
  { to: "/policies",    label: "Policies",    icon: Shield },
  { to: "/faq",         label: "Help & FAQ",  icon: HelpCircle },
  { to: "/settings",    label: "Settings",    icon: Settings },
];

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-50 md:hidden bg-background border-t rounded-t-2xl shadow-xl pb-2">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">More</span>
            <button onClick={() => setMoreOpen(false)} className="p-1 rounded hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 p-3">
            {MORE_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => cn(
                  "flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-tight text-center">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background/95 backdrop-blur border-t"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center h-14">
          {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors",
              moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
