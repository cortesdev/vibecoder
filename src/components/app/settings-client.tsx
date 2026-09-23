"use client";

import { useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";

const KEY_PROVIDERS = [
  { id: "opencode", label: "OpenCode Zen", hint: "Free key at opencode.ai — unlocks Big Pickle, Grok Code." },
  { id: "zai", label: "Z.ai", hint: "Free key at z.ai — unlocks GLM Flash." },
] as const;

interface Pack {
  credits: number;
  priceUsd: number;
  label: string;
}

export default function SettingsClient({
  initialProviders,
  balance,
  packs,
  demoCheckout,
}: {
  initialProviders: string[];
  balance: number;
  packs: Pack[];
  demoCheckout: boolean;
}) {
  const [providers, setProviders] = useState<string[]>(initialProviders);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [buyMsg, setBuyMsg] = useState("");

  async function saveKey(providerId: string) {
    const key = drafts[providerId]?.trim();
    if (!key || busy) return;
    setBusy(true);
    const res = await fetch("/api/app/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: providerId, key }),
    });
    setBusy(false);
    if (res.ok) {
      setProviders((p) => (p.includes(providerId) ? p : [...p, providerId]));
      setDrafts((d) => ({ ...d, [providerId]: "" }));
      setSaved((s) => ({ ...s, [providerId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [providerId]: false })), 2500);
    }
  }

  async function removeKey(providerId: string) {
    setBusy(true);
    await fetch(`/api/app/keys?provider=${providerId}`, { method: "DELETE" });
    setBusy(false);
    setProviders((p) => p.filter((x) => x !== providerId));
  }

  async function buyPack(credits: number) {
    setBuyMsg("Opening checkout…");
    const res = await fetch("/api/app/credits/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack: credits, mode: demoCheckout ? "test" : "live" }),
    });
    const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (data.ok && data.url) {
      window.location.href = data.url;
    } else {
      setBuyMsg(data.error ?? "Checkout unavailable right now.");
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      {/* API keys */}
      <section aria-labelledby="keys-h">
        <h2 id="keys-h" className="text-[17px] font-semibold">
          API keys
        </h2>
        <p className="muted mt-1 text-[13.5px]">Free keys unlock the free models. Takes about a minute each.</p>
        <div className="mt-4 flex flex-col gap-3">
          {KEY_PROVIDERS.map((p) => {
            const has = providers.includes(p.id);
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} aria-hidden="true" style={{ color: "var(--ink-2)" }} />
                    <span className="font-semibold text-[14.5px]">{p.label}</span>
                    {has && (
                      <span className="tier-badge tier-badge-free">
                        <Check size={10} aria-hidden="true" className="mr-0.5 inline" />
                        connected
                      </span>
                    )}
                  </div>
                  {has && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => removeKey(p.id)}
                      disabled={busy}
                    >
                      <Trash2 size={13} aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>
                <p className="muted mt-1.5 text-[13px]">{p.hint}</p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="password"
                    className="input flex-1 font-mono text-[13px]"
                    placeholder={has ? "Replace key…" : "Paste API key…"}
                    value={drafts[p.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => saveKey(p.id)}
                    disabled={busy || !drafts[p.id]?.trim()}
                  >
                    {saved[p.id] ? <Check size={14} aria-hidden="true" /> : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Credits */}
      <section aria-labelledby="credits-h">
        <h2 id="credits-h" className="text-[17px] font-semibold">
          Credits
        </h2>
        <p className="muted mt-1 text-[13.5px]">
          Balance: <strong style={{ color: "var(--good)" }}>{balance} credits</strong> · hosted models debit per prompt ·
          free models are always free.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {packs.map((p) => (
            <div key={p.credits} className="card flex flex-col p-4">
              <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                {p.label}
              </span>
              <span className="mt-1 text-[22px] font-bold tracking-[-0.02em]">{p.credits}</span>
              <span className="muted text-[13px]">credits</span>
              <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => buyPack(p.credits)}>
                ${p.priceUsd}
              </button>
            </div>
          ))}
        </div>
        <p aria-live="polite" className="mt-2 min-h-[20px] text-[13px]" style={{ color: "var(--accent)" }}>
          {buyMsg}
        </p>
      </section>
    </div>
  );
}
