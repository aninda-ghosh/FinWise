import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onUnlocked: () => void;
}

type Phase = "input" | "starting" | "wrong_password";

export function PasswordGate({ onUnlocked }: Props) {
  const [isNew, setIsNew] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<boolean>("is_new_db").then(setIsNew);
  }, []);

  // After spawning the server, poll health until it responds or we time out.
  useEffect(() => {
    if (phase !== "starting") return;
    let cancelled = false;
    const deadline = Date.now() + 10_000;

    (async () => {
      while (!cancelled) {
        if (Date.now() > deadline) {
          if (!cancelled) setPhase("wrong_password");
          return;
        }
        try {
          const res = await fetch("http://localhost:3001/health", {
            signal: AbortSignal.timeout(1000),
          });
          if (res.ok) {
            if (!cancelled) onUnlocked();
            return;
          }
        } catch {
          // not up yet
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, onUnlocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (isNew && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await invoke("spawn_server", { password });
      setPhase("starting");
    } catch {
      setError("Failed to start the server. Please try again.");
    }
  };

  const handleRetry = () => {
    setPassword("");
    setConfirm("");
    setError("");
    setPhase("input");
  };

  if (isNew === null) return null;

  if (phase === "starting") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Starting Finwise…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="w-full max-w-xs space-y-6 p-8">
        <div>
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg mb-4">
            FW
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {isNew ? "Set a password" : "Welcome back"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isNew
              ? "Your financial data will be encrypted with this password."
              : "Enter your password to unlock Finwise."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
            autoComplete={isNew ? "new-password" : "current-password"}
          />
          {isNew && (
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="new-password"
            />
          )}

          {(error || phase === "wrong_password") && (
            <p className="text-destructive text-sm">
              {phase === "wrong_password"
                ? "Wrong password — the database could not be unlocked."
                : error}
            </p>
          )}

          {phase === "wrong_password" ? (
            <button
              type="button"
              onClick={handleRetry}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
            >
              Try again
            </button>
          ) : (
            <button
              type="submit"
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
            >
              {isNew ? "Create password" : "Unlock"}
            </button>
          )}
        </form>

        {!isNew && (
          <p className="text-xs text-muted-foreground text-center">
            Forgot your password? Run{" "}
            <code className="font-mono">./uninstall.sh --wipe-data</code> to
            reset all data.
          </p>
        )}
      </div>
    </div>
  );
}
