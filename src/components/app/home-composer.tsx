"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import ModelPicker, { useLiveReadiness } from "./model-picker";
import AttachmentPicker, { type PickedFile } from "@/components/projects/attachment-picker";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { resolveTemplate } from "@/lib/templates/catalog";
import { downscaleImage } from "@/lib/attachments/client";
import { effectiveStatement, resolveEffectiveModel } from "@/lib/model-selection";
import type { ModelReadiness } from "@/lib/readiness";

// Home chat composer: type a message, hit Enter, and it creates the project
// and jumps straight into the conversation. No narrowing questions, no
// separate Build button — just a chat input with model, mode and attachments.

const MODES = ["Build", "Plan", "Mission", "Skills"] as const;
type Mode = (typeof MODES)[number];

function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  return (words.length > 42 ? `${words.slice(0, 42)}…` : words) || "New project";
}

export default function HomeComposer({
  readiness = [],
  initialPrompt = "",
  initialTemplate = "",
}: {
  readiness?: ModelReadiness[];
  initialPrompt?: string;
  initialTemplate?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [mode, setMode] = useState<Mode>("Build");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<PickedFile[]>([]);
  const { readiness: liveReadiness, secondsLeft } = useLiveReadiness(readiness);
  const effectiveNote = effectiveStatement(resolveEffectiveModel(modelId, liveReadiness));

  async function submit() {
    const text = prompt.trim();
    const valid = attachments.filter((a) => !a.error);
    if ((!text && valid.length === 0) || busy) return;
    setBusy(true);
    setError("");
    setStatus("Starting your project…");
    try {
      const templateId = resolveTemplate(searchParams.get("template") ?? initialTemplate).id;
      const created = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(text || valid.map((a) => a.file.name).join(", ")), templateId }),
      });
      const data = (await created.json()) as { ok: boolean; project?: { id: string }; error?: string };
      if (!created.ok || !data.ok || !data.project) throw new Error(data.error ?? "Could not create the project.");
      const projectId = data.project.id;
      // First turn runs through the multipart agent route so attachments ride
      // along; the thread below shows the persisted result. Typed text is kept
      // until the server answers.
      const form = new FormData();
      form.set("message", text);
      form.set("mode", mode.toLowerCase());
      if (modelId) form.set("modelId", modelId);
      for (const p of valid) {
        let blob: Blob = p.file;
        if (p.file.type === "image/png" || p.file.type === "image/jpeg" || p.file.type === "image/webp") {
          try {
            blob = (await downscaleImage(p.file)).blob;
          } catch {
            // Ship the original; the server validates authoritatively.
          }
        }
        form.append("attachments", blob, p.file.name);
      }
      setStatus("Running your first prompt…");
      const turned = await fetch(`/api/app/projects/${projectId}/agent`, { method: "POST", body: form });
      const result = (await turned.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!turned.ok || !result?.ok) throw new Error(result?.error ?? "The first prompt failed.");
      router.push(`/agent/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div
        className="rounded-2xl p-3 transition-shadow focus-within:shadow-[0_0_0_1px_var(--accent)]"
        style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <AttachmentPicker value={attachments} onChange={setAttachments} />

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
              void submit();
            }
          }}
          disabled={busy}
        />

        <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-inset)" }} role="tablist" aria-label="Agent mode">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold"
                style={mode === m ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--ink-2)" }}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <ModelPicker
            value={modelId}
            onChange={setModelId}
            readiness={liveReadiness}
            secondsLeft={secondsLeft}
          />
          <button
            type="button"
            className="btn btn-primary ml-auto flex h-9 w-9 items-center justify-center !p-0"
            onClick={() => void submit()}
            disabled={busy || (!prompt.trim() && attachments.filter((a) => !a.error).length === 0)}
            aria-label="Send message"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </div>
        {effectiveNote && (
          <p className="mt-1 px-1 text-[11.5px]" style={{ color: "var(--warn)" }} data-testid="effective-model">
            {effectiveNote}
          </p>
        )}
      </div>

      <p
        aria-live="polite"
        className="notice-reveal mt-3 min-h-[22px] text-center text-[13px]"
        style={{ color: error ? "var(--accent)" : "var(--ink-2)" }}
      >
        {error || status || "\u00A0"}
      </p>
    </div>
  );
}
