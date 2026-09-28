"use client";

import { useState } from "react";
import { AlertTriangle, Check, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { readinessLabel, readinessColor } from "./model-picker";
import type { ModelReadiness } from "@/lib/readiness";

// Every provider a user can bring a key for, in the order they should try
// them. The $0 Google tier comes first because it is what makes the first
// prompt answer without paying anything. OpenCode Zen is listed last on
// purpose: its free tier is gated to the OpenCode app itself, so a Zen key
// only ever buys its *paid* models — promising free Zen models here is what
// sent users into an unexplainable 403.
const KEY_PROVIDERS = [
  { id: "google", label: "Google AI Studio", hint: "Free key at aistudio.google.com — Gemini Flash on Google's free tier (daily quota)." },
  { id: "cerebras", label: "Cerebras", hint: "Free key at cloud.cerebras.ai — fast Llama 70B on the free plan." },
  { id: "groq", label: "Groq", hint: "Free key at console.groq.com — GPT-OSS 120B on the free plan." },
  { id: "huggingface", label: "Hugging Face", hint: "Free token at hf.co/settings/tokens — GPT-OSS via the Inference Providers router (small monthly credit)." },
  { id: "zai", label: "Z.ai", hint: "Free key at z.ai — GLM Flash runs at $0." },
  { id: "openrouter", label: "OpenRouter", hint: "Key at openrouter.ai — free route, 50 requests/day per key." },
  { id: "nvidia", label: "NVIDIA NIM", hint: "Free key at build.nvidia.com — Nemotron trial endpoint." },
  { id: "opencode", label: "OpenCode Zen", hint: "Key from opencode.ai — paid Zen models only; Zen's free tier works only inside the OpenCode app." },
  { id: "anthropic", label: "Anthropic", hint: "Optional: your own Claude key, billed by Anthropic instead of from credits." },
  { id: "openai", label: "OpenAI", hint: "Optional: your own OpenAI key, billed by OpenAI instead of from credits." },
] as const;

interface KeysResponse {
  ok?: boolean;
  providers?: string[];
  readiness?: ModelReadiness[];
}

/** The verdict line for one provider, straight from what the provider said. */
function ProviderStatus({ states }: { states: ModelReadiness[] }) {
  if (states.length === 0) return null;
  const worst = states.find((s) => s.status !== "live") ?? states[0];
  const ok = states.every((s) => s.status === "live");
  const label = readinessLabel(worst.status) ?? "checked";
  return (
    <p
      className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-relaxed"
      style={{ color: readinessColor(worst.status) }}
      data-readiness={worst.status}
    >
      {ok ? (
        <Check size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      )}
      <span>
        <span className="font-semibold uppercase tracking-wide text-[11px]">{label}</span>
        {" — "}
        {states.map((s) => s.message).join(" ")}
      </span>
    </p>
  );
}

export default function SettingsClient({
  initialProviders,
  initialReadiness,
}: {
  initialProviders: string[];
  initialReadiness: ModelReadiness[];
}) {
  const [providers, setProviders] = useState<string[]>(initialProviders);
  const [readiness, setReadiness] = useState<ModelReadiness[]>(initialReadiness);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function absorb(data: KeysResponse) {
    if (Array.isArray(data.providers)) setProviders(data.providers);
    if (Array.isArray(data.readiness)) setReadiness(data.readiness);
  }

  /** Save, then let the provider itself confirm the key — the save request
   *  re-probes, so an accepted-looking key that is actually rejected is shown
   *  here rather than surfacing as a mystery failure on the first prompt. */
  async function saveKey(providerId: string) {
    const key = drafts[providerId]?.trim();
    if (!key || busy) return;
    setBusy(providerId);
    const res = await fetch("/api/app/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: providerId, key }),
    });
    const data = (await res.json().catch(() => ({}))) as KeysResponse;
    setBusy(null);
    if (res.ok) {
      absorb(data);
      setDrafts((d) => ({ ...d, [providerId]: "" }));
      setSaved((s) => ({ ...s, [providerId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [providerId]: false })), 2500);
    }
  }

  async function removeKey(providerId: string) {
    setBusy(providerId);
    const res = await fetch(`/api/app/keys?provider=${providerId}`, { method: "DELETE" });
    absorb((await res.json().catch(() => ({}))) as KeysResponse);
    setBusy(null);
  }

  /** Re-ask the providers without touching any key. */
  async function recheck() {
    if (busy) return;
    setBusy("__check__");
    const res = await fetch("/api/app/keys?refresh=1");
    absorb((await res.json().catch(() => ({}))) as KeysResponse);
    setBusy(null);
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      {/* API keys */}
      <section id="keys" aria-labelledby="keys-h">
        <h2 id="keys-h" className="text-[17px] font-semibold">
          API keys
        </h2>
        <p className="muted mt-1 text-[13.5px]">
          Free keys unlock the free models. Takes about a minute each — and as soon as one is saved it is
          checked against the provider, so you can see it working before you build anything.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-3"
          onClick={recheck}
          disabled={busy !== null}
        >
          <RefreshCw size={13} aria-hidden="true" className={busy === "__check__" ? "animate-spin" : undefined} />
          {busy === "__check__" ? "Checking…" : "Check keys again"}
        </button>
        <div className="mt-4 flex flex-col gap-3">
          {KEY_PROVIDERS.map((p) => {
            const has = providers.includes(p.id);
            const states = readiness.filter((r) => r.provider === p.id);
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
                      disabled={busy !== null}
                    >
                      <Trash2 size={13} aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>
                <p className="muted mt-1.5 text-[13px]">{p.hint}</p>
                <ProviderStatus states={states} />
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
                    disabled={busy !== null || !drafts[p.id]?.trim()}
                  >
                    {busy === p.id ? (
                      "Checking…"
                    ) : saved[p.id] ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
