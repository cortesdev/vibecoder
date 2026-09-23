"use client";

import { useState } from "react";
import { Check, LayoutTemplate } from "lucide-react";
import { PRESETS, type UiPreset } from "@/lib/presets";

function Thumb({ p }: { p: UiPreset }) {
  return (
    <div
      className="flex h-16 w-full flex-col gap-1 overflow-hidden rounded-md border p-2"
      style={{ background: p.swatches[0], borderColor: "var(--hairline)" }}
    >
      <span
        className="h-1.5 w-24 rounded-sm"
        style={{
          background: p.gradient
            ? `linear-gradient(90deg, ${p.gradient[0]}, ${p.gradient[1]})`
            : p.swatches[1],
        }}
      />
      <span className="h-1 w-16 rounded-sm" style={{ background: p.dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)" }} />
      <span className="mt-auto flex gap-1">
        <span className="h-2 w-7 rounded-sm" style={{ background: p.swatches[2], border: "1px solid" + (p.dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)") }} />
        <span className="h-2 w-4 rounded-sm" style={{ background: p.swatches[1], opacity: 0.8 }} />
      </span>
    </div>
  );
}

export default function UiPresetsPanel({
  projectId,
  onApplied,
}: {
  projectId: string;
  onApplied: (file: { path: string; content: string }) => void;
}) {
  const [applied, setApplied] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");

  async function apply(p: UiPreset) {
    if (busy) return;
    setBusy(p.slug);
    setStatus("");
    const res = await fetch(`/api/app/projects/${projectId}/apply-preset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: p.slug }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      name?: string;
      file?: { path: string; content: string };
    } | null;
    setBusy("");
    if (!res.ok || !data?.ok || !data.file) {
      setStatus(data?.error ?? "Apply failed.");
      return;
    }
    setApplied(p.slug);
    onApplied(data.file);
    setStatus(`${data.name} applied.`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <LayoutTemplate size={15} aria-hidden="true" /> UI Presets
        </h2>
        <span className="chip text-[11px]">Catalog</span>
        {status && <span className="truncate text-[12px]" style={{ color: "var(--good)" }}>{status}</span>}
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto p-3 sm:grid-cols-2">
        {PRESETS.map((p) => {
          const isApplied = applied === p.slug;
          return (
            <div key={p.slug} className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: isApplied ? "var(--accent)" : "var(--hairline)" }}>
              <Thumb p={p} />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold">{p.name}</p>
                <button
                  type="button"
                  className={isApplied ? "chip" : "btn btn-secondary btn-sm"}
                  onClick={() => apply(p)}
                  disabled={busy !== ""}
                >
                  {busy === p.slug ? "Applying…" : isApplied ? <Check size={13} aria-hidden="true" /> : "Apply"}
                </button>
              </div>
              <p className="line-clamp-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {p.blurb}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}