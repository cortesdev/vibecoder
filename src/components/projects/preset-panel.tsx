"use client";

import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { PRESETS } from "@/lib/presets";

// Preset panel: live thumbnail previews, Apply controls, selected state, and
// a visible Undo. Switching never reloads the app — the preview rebuilds from
// the rewritten stylesheet on its own.
export default function PresetPanel({
  projectId,
  activePresetId,
  onChanged,
}: {
  projectId: string;
  activePresetId: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function act(action: "apply" | "undo", slug?: string) {
    if (busy) return;
    setBusy(slug ?? "undo");
    setMessage("");
    setFailed(false);
    try {
      const res = await fetch(`/api/app/projects/${projectId}/presets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(slug ? { slug } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Theme ${action} failed.`);
      setMessage(action === "undo" ? "Undone — previous stylesheet restored." : "Theme applied.");
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Theme ${action} failed.`);
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-label="UI presets">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">Themes</p>
        <button
          type="button"
          className="chip"
          onClick={() => void act("undo")}
          disabled={busy !== null}
          aria-label="Undo last theme change"
          title="Restore the stylesheet from before the last theme change"
        >
          <Undo2 size={13} aria-hidden="true" />
          {busy === "undo" ? "Undoing…" : "Undo"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Themes">
        {PRESETS.map((p) => {
          const selected = p.slug === activePresetId;
          return (
            <div
              key={p.slug}
              role="radio"
              aria-checked={selected}
              aria-label={`${p.name}${selected ? " (current)" : ""}`}
              className="overflow-hidden rounded-xl"
              style={{
                background: "var(--bg-raised)",
                boxShadow: selected ? "0 0 0 2px var(--accent)" : "inset 0 0 0 1px var(--hairline)",
              }}
            >
              <div className="flex h-14" aria-hidden="true" style={{ background: p.thumb[0] }}>
                <div className="m-2 ml-auto h-6 w-6 rounded-full" style={{ background: p.thumb[1] }} />
                <div className="m-2 h-6 flex-1 rounded" style={{ background: "rgba(255,255,255,0.14)" }} />
              </div>
              <div className="px-3 pb-1 pt-2 text-[13px] font-semibold">
                {p.name}
                {selected && <Check size={13} aria-hidden="true" className="ml-1 inline" style={{ color: "var(--good)" }} />}
              </div>
              <p className="muted px-3 text-[12px] leading-snug">{p.blurb}</p>
              <div className="px-3 pb-3 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full"
                  onClick={() => void act("apply", p.slug)}
                  disabled={busy !== null || selected}
                >
                  {busy === p.slug ? "Applying…" : selected ? "Current" : "Apply"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {message && (
        <p role={failed ? "alert" : "status"} className="text-[13px]" style={{ color: failed ? "var(--accent)" : "var(--ink-2)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
