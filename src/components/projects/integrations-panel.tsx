"use client";

import { useState } from "react";
import { INTEGRATION_CATEGORIES, type IntegrationService } from "@/lib/integrations";

// Integrations panel: connect a service credential for a project. Keys are
// POSTed to the server and never returned again — the panel only ever shows a
// count, so a key can't leak back into the client after it is saved.

export default function IntegrationsPanel({
  projectId,
  services,
  initialCounts,
}: {
  projectId: string;
  services: IntegrationService[];
  initialCounts: Record<string, number>;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [category, setCategory] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visible = category === "All" ? services : services.filter((s) => s.category === category);

  async function connect(slug: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/app/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, key, label }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; counts?: Record<string, number> }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ? `Could not save: ${data.error}` : `Could not save (${res.status})`);
      }
      setCounts(data.counts ?? {});
      const name = services.find((s) => s.slug === slug)?.name ?? slug;
      setNotice(`${name} connected. The key is stored server-side.`);
      setKey("");
      setLabel("");
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — your key is still in the field.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(slug: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/app/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; counts?: Record<string, number> }
        | null;
      if (!res.ok || !data?.ok) throw new Error(`Could not disconnect (${res.status})`);
      setCounts(data.counts ?? {});
      setNotice("Credential removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-project={projectId}>
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--line)] px-3 py-2">
        {INTEGRATION_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className="rounded-full px-2.5 py-1 text-[12px]"
            style={{
              background: category === c ? "var(--accent-soft)" : "transparent",
              border: "1px solid var(--line)",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="px-3 py-1.5 text-[12px]" style={{ color: "var(--accent)" }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="muted px-3 py-1.5 text-[12px]">
          {notice}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {visible.map((s) => {
          const count = counts[s.slug] ?? 0;
          const isOpen = open === s.slug;
          return (
            <li key={s.slug} className="border-b border-[var(--line)] py-2.5 last:border-0">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[12px] font-semibold"
                  style={{
                    background: `hsl(${s.hue} 70% 92%)`,
                    color: `hsl(${s.hue} 60% 28%)`,
                  }}
                >
                  {s.monogram}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{s.name}</p>
                  <p className="muted truncate text-[12px]">{s.blurb}</p>
                </div>
                {count > 0 ? (
                  <span className="muted shrink-0 text-[12px]">
                    {count} connected
                  </span>
                ) : null}
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2.5 py-1 text-[12px]"
                  style={{ border: "1px solid var(--line)" }}
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : s.slug);
                    setError("");
                    setNotice("");
                  }}
                >
                  {count > 0 ? "Add key" : "Connect"}
                </button>
                {count > 0 && (
                  <button
                    type="button"
                    className="muted shrink-0 text-[12px] underline"
                    disabled={busy}
                    onClick={() => disconnect(s.slug)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {isOpen && (
                <form
                  className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void connect(s.slug);
                  }}
                >
                  <label className="flex-1 text-[12px]">
                    <span className="muted">API key</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder={s.name}
                      className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                      style={{ border: "1px solid var(--line)" }}
                    />
                  </label>
                  <label className="sm:w-40 text-[12px]">
                    <span className="muted">Label</span>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Primary"
                      className="mt-1 w-full rounded-md px-2 py-1.5 text-[13px]"
                      style={{ border: "1px solid var(--line)" }}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !key.trim()}
                    className="shrink-0 rounded-md px-3 py-1.5 text-[13px]"
                    style={{ border: "1px solid var(--line)" }}
                  >
                    {busy ? "Saving…" : "Save key"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
        {visible.length === 0 && <li className="muted py-4 text-[13px]">No services in this category yet.</li>}
      </ul>
    </div>
  );
}
