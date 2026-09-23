"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import ModelPicker from "./model-picker";

// The Freebuff-style home composer: one box that starts everything. Typing a
// prompt creates the project and immediately runs it on the selected model —
// the file tree exists from the first second.

const MODE_CHIPS = ["Build", "Plan"] as const;

function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  return (words.length > 42 ? `${words.slice(0, 42)}…` : words) || "New project";
}

export default function HomeComposer({ balance }: { balance: number }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("big-pickle");
  const [mode, setMode] = useState<(typeof MODE_CHIPS)[number]>("Build");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setStatus("Creating project…");

    try {
      const created = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(text) }),
      });
      const createdData = (await created.json()) as {
        ok: boolean;
        project?: { id: string };
        error?: string;
      };
      if (!created.ok || !createdData.ok || !createdData.project) {
        throw new Error(createdData.error ?? "Could not create the project.");
      }
      const projectId = createdData.project.id;

      setStatus(mode === "Plan" ? "Planning…" : "Agent is building…");
      const run = await fetch(`/api/app/projects/${projectId}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, modelId }),
      });
      const runData = (await run.json()) as {
        ok: boolean;
        error?: string;
        modelLabel?: string;
        usedFallback?: boolean;
        notice?: string;
      };
      if (!run.ok || !runData.ok) {
        // Project exists; land there and surface the error in the builder.
        router.push(`/agent/projects/${projectId}?error=${encodeURIComponent(runData.error ?? "agent failed")}`);
        router.refresh();
        return;
      }

      const params = new URLSearchParams();
      if (runData.usedFallback) params.set("fallback", "1");
      if (runData.notice) params.set("notice", runData.notice);
      router.push(`/agent/projects/${projectId}${params.size ? `?${params}` : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div
        className="rounded-2xl p-3 transition-shadow"
        style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <label htmlFor="home-prompt" className="sr-only">
          Describe what to build
        </label>
        <textarea
          id="home-prompt"
          className="w-full resize-none bg-transparent px-2 py-2 font-[inherit] text-[15.5px] leading-relaxed outline-none"
          style={{ color: "var(--ink)" }}
          placeholder="Describe what to build — a landing page, a game, a dashboard…"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={busy}
        />

        <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "var(--bg-inset)" }}
            role="tablist"
            aria-label="Agent mode"
          >
            {MODE_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className="rounded-md px-3 py-1 text-[13px] font-semibold"
                style={mode === m ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--ink-2)" }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <ModelPicker value={modelId} onChange={setModelId} balance={balance} />

          <button
            type="button"
            className="btn btn-primary ml-auto flex !h-9 !w-9 items-center justify-center !p-0"
            onClick={submit}
            disabled={busy || !prompt.trim()}
            aria-label="Send prompt"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p aria-live="polite" className="notice-reveal mt-3 min-h-[22px] text-center text-[13px]" style={{ color: error ? "var(--accent)" : "var(--ink-2)" }}>
        {error || status || "\u00A0"}
      </p>
    </div>
  );
}
