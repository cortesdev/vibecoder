"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import ModelPicker from "./model-picker";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import type { ModelReadiness } from "@/lib/readiness";

// Simple home composer for testing models directly:
// pick a model, type what to build, answer up to 3 narrowing questions
// or skip straight to building. No wallet/credits involved.

const MODE_CHIPS = ["Build", "Plan"] as const;

interface Question {
  question: string;
  options: string[];
}

const INTERVIEWS: Record<string, Question[]> = {
  landing: [
    { question: "What's the main call to action?", options: ["Sign up", "Buy now", "Join the waitlist", "Book a demo"] },
    { question: "Who are you pitching to?", options: ["Early adopters", "Investors", "General public", "Paying customers"] },
    { question: "What tone should it strike?", options: ["Clean & minimal", "Playful & bold", "Technical & precise", "Premium & elegant"] },
  ],
  game: [
    { question: "What kind of game?", options: ["Arcade", "Puzzle", "Endless runner", "Text adventure"] },
    { question: "How do you control it?", options: ["Keyboard", "Mouse", "Both", "Tap / touch"] },
    { question: "What does winning look like?", options: ["Beat a high score", "Finish all levels", "Survive as long as possible", "Collect everything"] },
  ],
  app: [
    { question: "What's the core action?", options: ["Create things", "Track data", "Automate workflows", "Collaborate with others"] },
    { question: "Who is it for?", options: ["Just me", "My team", "Customers", "The public"] },
    { question: "How does data get in?", options: ["Manual entry", "Upload files", "Connect a service", "Seed demo data"] },
  ],
  default: [
    { question: "What's the one job version 1 must nail?", options: ["Get people signed up", "Show off a core feature", "Validate an idea", "Automate a task"] },
    { question: "Who is it for?", options: ["Just me", "My team", "Customers", "The public"] },
    { question: "How polished should the first cut be?", options: ["Quick & scrappy", "Clean but basic", "Feels finished", "Pixel-perfect"] },
  ],
};

const GENRES: [RegExp, keyof typeof INTERVIEWS][] = [
  [/landing|marketing|landing page|site|website|waitlist|pricing/, "landing"],
  [/game|playable|arcade|puzzle|runner/, "game"],
  [/dashboard|saas|tool|app|editor|workflow|tracker|admin/, "app"],
];

function pickInterview(prompt: string): Question[] {
  const low = prompt.toLowerCase();
  for (const [re, key] of GENRES) if (re.test(low)) return INTERVIEWS[key];
  return INTERVIEWS.default;
}

function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  return (words.length > 42 ? `${words.slice(0, 42)}…` : words) || "New project";
}

export default function HomeComposer({
  readiness = [],
  initialPrompt = "",
}: {
  readiness?: ModelReadiness[];
  initialPrompt?: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [mode, setMode] = useState<(typeof MODE_CHIPS)[number]>("Build");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const autoRanRef = useRef(false);

  // Removed auto-execution on page load - user must explicitly trigger agent builds

  const [narrowing, setNarrowing] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const interview = useMemo(() => pickInterview(prompt), [prompt]);

  function startNarrowing() {
    if (!prompt.trim() || narrowing || busy) return;
    setAnswers([]);
    setStep(0);
    setDraft("");
    setNarrowing(true);
  }

  function finish(answersArr: string[]) {
    const original = prompt.trim();
    const detail = answersArr.length
      ? `\n\nContext from the narrowing questions:\n${interview
          .map((q, i) => ({ q: q.question, a: answersArr[i] }))
          .filter((x) => x.a)
          .map((x) => `- ${x.q}: ${x.a}`)
          .join("\n")}`
      : "";
    setNarrowing(false);
    // Don't auto-submit - let user click Build button explicitly
    // void submit(`${original}${detail}`);
  }

  function choose(option: string) {
    const next = [...answers, option];
    if (step + 1 >= interview.length) finish(next);
    else { setAnswers(next); setStep(step + 1); setDraft(""); }
  }

  function chooseCustom() {
    const t = draft.trim();
    if (t) choose(t);
  }

  async function readStream(res: Response, projectId: string, onDone: (data: { ok: boolean; error?: string; notice?: string; usedFallback?: boolean }) => void): Promise<void> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No stream");
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim().split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const msg = JSON.parse(line.slice(6)) as { type: string; message?: string; error?: string; notice?: string; usedFallback?: boolean; ok?: boolean };
          if (msg.type === "status" || msg.type === "heartbeat") {
            if (msg.message) { setStatus(msg.message); setLog((p) => [...p.slice(-18), msg.message!]); }
          } else if (msg.type === "error") {
            onDone({ ok: false, error: msg.error, notice: msg.notice });
            return;
          } else if (msg.type === "done") {
            onDone(msg as unknown as { ok: boolean; error?: string; notice?: string; usedFallback?: boolean });
            return;
          }
        } catch {}
      }
    }
  }

  async function submit(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setLog([]);
    setStatus("Creating project…");
    setLog(["Creating project…"]);
    try {
      const created = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(text) }),
      });
      const createdData = (await created.json()) as { ok: boolean; project?: { id: string }; error?: string };
      if (!created.ok || !createdData.ok || !createdData.project) throw new Error(createdData.error ?? "Could not create the project.");
      const projectId = createdData.project.id;
      setStatus(mode === "Plan" ? "Planning…" : "Agent is building…");
      setLog((p) => [...p, mode === "Plan" ? "Planning…" : "Agent is building…"]);
      const run = await fetch(`/api/app/projects/${projectId}/prompt/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, modelId }),
      });
      if (run.headers.get("content-type")?.includes("text/event-stream")) {
        await readStream(run, projectId, (runData) => {
          if (!runData.ok) {
            router.push(`/agent/projects/${projectId}?error=${encodeURIComponent(runData.error ?? "agent failed")}`);
            router.refresh();
            return;
          }
          const params = new URLSearchParams();
          if (runData.usedFallback) params.set("fallback", "1");
          if (runData.notice) params.set("notice", runData.notice);
          router.push(`/agent/projects/${projectId}${params.size ? `?${params}` : ""}`);
          router.refresh();
        });
        return;
      }
      const runData = (await run.json()) as { ok: boolean; error?: string; notice?: string; usedFallback?: boolean };
      if (!run.ok || !runData.ok) {
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

  if (narrowing) {
    const q = interview[step];
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>Narrowing to a version 1 · {step + 1} of {interview.length}</p>
            <button type="button" className="rounded-md px-1.5 py-0.5 text-xs hover:opacity-70" style={{ color: "var(--ink-3)" }} onClick={() => { setNarrowing(false); setStep(0); setAnswers([]); setDraft(""); }}>Cancel</button>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-inset)" }}><span className="block h-full rounded-full transition-all duration-300" style={{ width: `${((step + 1) / interview.length) * 100}%`, background: "var(--accent)" }} /></div>
          <p className="mt-4 text-[17px] font-semibold leading-snug">{q.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">{q.options.map((o) => (
            <button key={o} type="button" className="rounded-lg px-3.5 py-2 text-[13px] transition-colors hover:opacity-80" style={{ color: "var(--ink-2)", background: "var(--bg-inset)", boxShadow: "inset 0 0 0 1px var(--hairline)" }} onClick={() => choose(o)} disabled={busy}>{o}</button>
          ))}</div>
          <div className="mt-3 flex items-center gap-2">
            <input className="input h-10 flex-1 text-[14px]" placeholder="Or describe it yourself…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); chooseCustom(); } }} />
            <button type="button" aria-label="Next question" className="btn btn-primary flex h-10 w-10 shrink-0 items-center justify-center !p-0" onClick={chooseCustom} disabled={busy || !draft.trim()}><ArrowUp size={16} aria-hidden="true" /></button>
          </div>
          <button type="button" className="mt-3 rounded-md text-[13px] hover:opacity-70" style={{ color: "var(--ink-3)" }} onClick={() => finish(answers)} disabled={busy}>Skip and build it now</button>
        </div>
        <p aria-live="polite" className="notice-reveal mt-3 min-h-[22px] text-center text-[13px]" style={{ color: error ? "var(--accent)" : "var(--ink-2)" }}>{error || status || "\u00A0"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="rounded-2xl p-3 transition-shadow" style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
        <label htmlFor="home-prompt" className="sr-only">Describe what to build</label>
        <textarea id="home-prompt" className="w-full resize-none bg-transparent px-2 py-2 font-[inherit] text-[15.5px] leading-relaxed outline-none" style={{ color: "var(--ink)" }} placeholder="Describe what to build — a landing page, a game, a dashboard…" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy && prompt.trim()) startNarrowing(); } }} disabled={busy} />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-inset)" }} role="tablist" aria-label="Agent mode">
            {MODE_CHIPS.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className="rounded-md px-3 py-1 text-[13px] font-semibold" style={mode === m ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--ink-2)" }} onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          <ModelPicker value={modelId} onChange={setModelId} readiness={readiness} />
          <button type="button" className="btn btn-primary ml-auto flex h-9 min-w-[100px] items-center justify-center gap-2 px-3" onClick={startNarrowing} disabled={busy || !prompt.trim()} aria-label="Start building">
            <span>Build</span>
            <ArrowUp size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p aria-live="polite" className="notice-reveal mt-3 min-h-[22px] text-center text-[13px]" style={{ color: error ? "var(--accent)" : "var(--ink-2)" }}>{error || status || "\u00A0"}</p>
      {busy && log.length > 0 && (
        <div className="mx-auto mt-3 w-full max-w-[720px] rounded-xl p-3 text-left" style={{ background: "var(--bg-inset)", border: "1px solid var(--hairline)" }}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>Progress</p>
          <ul className="mono space-y-0.5 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {log.map((m, i) => (<li key={i}>› {m}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
