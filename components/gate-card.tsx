"use client";

import { useState } from "react";
import { Lock, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function GateCard() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        // Full navigation so middleware + layout re-evaluate with the new cookie.
        window.location.assign("/");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Incorrect code.");
      setCode("");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold">This dashboard is private</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only Vineeth can access JobRadar. Enter your access code to continue.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <label htmlFor="code" className="sr-only">
          Access code
        </label>
        <input
          id="code"
          name="code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={Boolean(error)}
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-center text-lg tracking-[0.4em] outline-none transition",
            "placeholder:tracking-normal placeholder:text-muted-foreground",
            "focus:ring-2 focus:ring-ring",
            error ? "border-fit-low" : "border-input",
          )}
        />
        {error && (
          <p className="text-center text-sm text-fit-low" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2",
            "text-sm font-medium text-primary-foreground transition",
            "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              Unlock <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Single-owner access. If this isn&apos;t your dashboard, there&apos;s
        nothing to see here.
      </p>
    </div>
  );
}
