"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plug, Search, X } from "lucide-react";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  type IntegrationService,
} from "@/lib/integrations";

export default function IntegrationsPanel() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [connecting, setConnecting] = useState<IntegrationService | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("Primary");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/app/integrations")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.ok) setCounts(d.counts ?? {});
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const services = useMemo(
    () =>
      INTEGRATIONS.filter((s) => {
        if (category !== "All" && s.category !== category) return false;
        const q = query.trim().toLowerCase();
        return !q || s.name.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q);
      }),
    [query, category],
  );

  async function saveKey() {
    if (!connecting) return;
    setSaving(true);
    setNotice("");
    const res = await fetch("/api/app/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: connecting.slug, key, label }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; counts?: Record<string, number> } | null;
    setSaving(false);
    if (!res.ok || !data?.ok) {
      setNotice(data?.error ?? "Could not save the key.");
      return;
    }
    setCounts(data.counts ?? {});
    setKey("");
    setLabel("Primary");
    setConnecting(null);
  }

  async function disconnect(slug: string) {
    const res = await fetch("/api/app/integrations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; counts?: Record<string, number> } | null;
    if (data?.ok) setCounts(data.counts ?? {});
  }

  const totalKeys = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Plug size={15} aria-hidden="true" /> Integrations
        </h2>
        <span className="chip text-[11px]">Catalog</span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--ink-3)" }}>
          {totalKeys} key{totalKeys === 1 ? "" : "s"} connected
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b p-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="relative">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
          <input
            className="input h-9 w-full pl-8 pr-3 text-[13px]"
            placeholder="Search services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {INTEGRATION_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? "chip" : "chip chip-muted"}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
          {services.length} service{services.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto p-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
        {services.map((s) => {
          const n = counts[s.slug] ?? 0;
          return (
            <div key={s.slug} className="flex h-full flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex items-center gap-2">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md border text-[15px] font-semibold"
                  style={{ background: `hsl(${s.hue} 60% 12%)`, color: `hsl(${s.hue} 90% 72%)`, borderColor: `hsl(${s.hue} 60% 22%)` }}
                >
                  {s.monogram}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{s.name}</p>
                  <p className="truncate text-[11px]" style={{ color: "var(--ink-3)" }}>{s.category}</p>
                </div>
                {n > 0 && (
                  <span className="chip shrink-0 text-[11px]" title={`${n} connected`}>
                    <KeyRound size={11} aria-hidden="true" /> {n}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {s.blurb}
              </p>
              <div className="mt-auto flex gap-2">
                <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => setConnecting(s)}>
                  {n > 0 ? "Add key" : "Connect"}
                </button>
                {n > 0 && (
                  <button
                    type="button"
                    className="chip"
                    aria-label={`Disconnect ${s.name}`}
                    title="Disconnect / remove keys"
                    onClick={() => disconnect(s.slug)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {services.length === 0 && (
          <p className="col-span-full py-8 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
            No services match “{query}”.
          </p>
        )}
      </div>

      {notice && (
        <p className="shrink-0 border-t px-3 py-2 text-[12px]" style={{ borderColor: "var(--hairline)", color: "var(--accent)" }}>
          {notice}
        </p>
      )}

      {connecting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`Connect ${connecting.name}`}
          onClick={() => setConnecting(null)}
        >
          <div
            className="card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span
                className="grid h-9 w-9 place-items-center rounded-md border text-[15px] font-semibold"
                style={{ background: `hsl(${connecting.hue} 60% 12%)`, color: `hsl(${connecting.hue} 90% 72%)`, borderColor: `hsl(${connecting.hue} 60% 22%)` }}
              >
                {connecting.monogram}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold">Connect {connecting.name}</h3>
                <p className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {connecting.category}
                </p>
              </div>
              <button type="button" className="chip" aria-label="Close" onClick={() => setConnecting(null)}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <form
              className="mt-3 flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                saveKey();
              }}
            >
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium">API key</span>
                <input
                  className="input w-full text-[13px]"
                  type="password"
                  required
                  autoFocus
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={`Paste your ${connecting.name} key…`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium">Label</span>
                <input className="input w-full text-[13px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Primary" />
              </label>
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConnecting(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !key.trim()}>
                  {saving ? "Saving…" : "Save key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}