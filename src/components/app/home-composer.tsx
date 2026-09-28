"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Paperclip, Send, X, File } from "lucide-react";
import ModelPicker from "./model-picker";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { resolveTemplate } from "@/lib/templates/catalog";
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

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  async function submit() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setStatus("Starting your project…");
    try {
      const templateId = resolveTemplate(searchParams.get("template") ?? initialTemplate).id;
      const created = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(text), templateId }),
      });
      const data = (await created.json()) as { ok: boolean; project?: { id: string }; error?: string };
      if (!created.ok || !data.ok || !data.project) throw new Error(data.error ?? "Could not create the project.");
      const params = new URLSearchParams();
      params.set("prompt", text);
      params.set("mode", mode.toLowerCase());
      if (modelId) params.set("model", modelId);
      router.push(`/agent/projects/${data.project.id}?${params.toString()}`);
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
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[11.5px]"
                style={{ borderColor: "var(--hairline)", background: "var(--bg-inset)" }}
              >
                {a.url ? (
                  <img src={a.url} alt="" className="h-5 w-5 rounded object-cover" />
                ) : (
                  <File size={12} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
                )}
                <span className="mono max-w-[140px] truncate">{a.name}</span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:opacity-70"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

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
          <ModelPicker value={modelId} onChange={setModelId} readiness={readiness} />
          <input
            type="file"
            multiple
            className="hidden"
            id="home-attach"
            accept="image/*,.pdf,.txt,.md,.json,.csv,.svg,.zip"
            onChange={(e) => {
              const list = e.target.files;
              if (list) {
                const added = Array.from(list).map((f, i) => ({
                  id: `${Date.now()}-${i}`,
                  name: f.name,
                  type: f.type || "file",
                  size: f.size,
                  url: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
                }));
                setAttachments((prev) => [...prev, ...added]);
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="chip"
            aria-label="Attach files"
            title="Attach files"
            onClick={() => document.getElementById("home-attach")?.click()}
          >
            <Paperclip size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-primary ml-auto flex h-9 w-9 items-center justify-center !p-0"
            onClick={() => void submit()}
            disabled={busy || !prompt.trim()}
            aria-label="Send message"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </div>
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
