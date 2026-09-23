"use client";

import { useState } from "react";

export default function UpgradeCard({ demoAvailable }: { demoAvailable: boolean }) {
  const [mode, setMode] = useState<"live" | "demo">(demoAvailable ? "demo" : "live");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function upgrade() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/upgrade/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, mode: mode === "demo" ? "test" : "live" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.error ?? "Something went wrong. Nothing was charged.");
    } catch {
      setNotice("Couldn't reach checkout. Nothing was charged — try again.");
    } finally {
      setLoading(false);
    }
  }

  const demo = mode === "demo";

  return (
    <div className="card p-8" id="upgrade-card" aria-labelledby="upgrade-h">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="upgrade-h" className="text-[22px] font-bold tracking-[-0.01em]">
          Vibecoder Pro
        </h3>
        <p className="text-[26px] font-bold tracking-[-0.02em]">
          {demo ? (
            <span className="muted text-[18px] font-semibold">demo — no money</span>
          ) : (
            <>
              $49 <span className="muted-3 text-sm font-medium">one-time</span>
            </>
          )}
        </p>
      </div>
      <p className="muted mt-2 text-[15px]">
        The app is free and complete. Pro funds development and adds convenience
        — never paywalls.
      </p>

      <ul className="mt-5 flex flex-col gap-2.5 text-[14.5px]" role="list">
        {[
          "Auto-update beta channel — new builds days early",
          "Priority issue triage on GitHub",
          "Pro badge on the GitHub sponsor board",
          "A warm feeling: you're paying for the thing everyone else gets free",
        ].map((item) => (
          <li key={item} className="muted flex gap-2.5">
            <span aria-hidden="true" style={{ color: "var(--good)" }}>
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>

      {demoAvailable && (
        <div
          className="mt-6 flex items-center gap-2 rounded-xl p-1"
          style={{ background: "var(--bg-inset)" }}
          role="group"
          aria-label="Checkout mode"
        >
          <button
            type="button"
            aria-pressed={mode === "demo"}
            onClick={() => setMode("demo")}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={
              mode === "demo"
                ? { background: "var(--bg-raised)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--hairline)" }
                : { color: "var(--ink-3)" }
            }
          >
            Try the flow (demo)
          </button>
          <button
            type="button"
            aria-pressed={mode === "live"}
            onClick={() => setMode("live")}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={
              mode === "live"
                ? { background: "var(--bg-raised)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--hairline)" }
                : { color: "var(--ink-3)" }
            }
          >
            Buy for real — $49
          </button>
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="upgrade-email" className="muted-3 mb-1.5 block text-[13px] font-medium">
          {demo ? "Email for the demo license (optional)" : "Email for the license key (optional)"}
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="upgrade-email"
            type="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            className={`whitespace-nowrap ${demo ? "btn btn-secondary" : "btn btn-primary"}`}
            onClick={upgrade}
            disabled={loading}
          >
            {loading ? "Opening checkout…" : demo ? "Run demo checkout" : "Upgrade — $49"}
          </button>
        </div>
      </div>

      {demo && (
        <p
          className="mt-4 rounded-xl p-3.5 text-[13.5px]"
          style={{ background: "var(--bg-inset)", color: "var(--ink-2)" }}
          role="note"
        >
          <strong style={{ color: "var(--ink)" }}>Demo mode:</strong> real Stripe
          checkout, zero money. On the payment page use the test card{" "}
          <code className="mono">4242 4242 4242 4242</code>, any future expiry,
          any CVC. You&rsquo;ll get a <code className="mono">TEST-</code> license
          key — everything works, nothing is charged, and it can&rsquo;t be
          confused with a real purchase.
        </p>
      )}

      {notice && (
        <p
          className="notice-reveal mt-4 rounded-xl p-3.5 text-sm"
          style={{ background: "var(--bg-inset)", color: "var(--ink-2)" }}
          role="status"
        >
          {notice}
        </p>
      )}

      <p className="muted-3 mt-5 text-[13px]">
        One payment, perpetual license, use on all your machines. 30-day
        refunds, no questions. Cancel nothing — there&rsquo;s nothing to
        cancel.
      </p>
    </div>
  );
}
