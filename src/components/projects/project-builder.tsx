"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { Download, File, FileCode, FilePlus2, FolderOpen, Globe, MoreHorizontal, Palette, Paperclip, PanelRightClose, PanelRightOpen, Plug, X } from "lucide-react";
import FileEditor from "./editor";
import ModelPicker, { useOutsideClose } from "@/components/app/model-picker";
import PreviewPane from "./preview-pane";
import UiPresetsPanel from "./ui-presets-panel";
import IntegrationsPanel from "./integrations-panel";
import { MODELS, PROVIDER_META, DEFAULT_MODEL_ID } from "@/lib/models";
import type { ModelReadiness } from "@/lib/readiness";
import type { TokenUsage } from "@/lib/agent/types";

// Right-hand tools column. Chat lives in its own separate panel; everything
// else (Files, Editor, Preview, UI Presets, Integrations) is a tab here.
type ToolTab = "files" | "editor" | "preview" | "presets" | "integrations";
const TOOL_TABS = [
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "editor", label: "Editor", icon: FileCode },
  { id: "preview", label: "Preview", icon: Globe },
  { id: "presets", label: "UI Presets", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
] satisfies { id: ToolTab; label: string; icon: typeof FolderOpen }[];

const MODES = ["Plan", "Build", "Design"] as const;
type RunMode = (typeof MODES)[number];

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string; // object URL for image thumbnails
  dataUrl?: string; // small images only, sent with the run
}

// Composer textarea grows with its content but never past this height.
const COMPOSER_MAX_HEIGHT = 180;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export interface ProjectFileDto {
  path: string;
  content: string;
}

export interface ChangeDto {
  id: string;
  path: string;
  status: "pending" | "applied" | "reverted";
  before: string;
  after: string;
  createdAt: string;
}

function changeDiff(c: ChangeDto): string[] {
  const patch = createTwoFilesPatch(`a/${c.path}`, `b/${c.path}`, c.before, c.after, "", "", {
    context: 3,
  });
  return patch.split("\n").filter((l) => !l.startsWith("***") && !l.startsWith("==="));
}

function DiffLines({ c }: { c: ChangeDto }) {
  return (
    <pre
      className="mono mt-2 max-h-56 overflow-auto rounded-lg p-2 text-[12px] leading-[1.6]"
      style={{ background: "var(--terminal)" }}
    >
      {changeDiff(c).map((line, i) => {
        const color = line.startsWith("+")
          ? "var(--good)"
          : line.startsWith("-")
            ? "var(--accent)"
            : line.startsWith("@@")
              ? "var(--ink-3)"
              : "var(--ink-2)";
        return (
          <span key={i} style={{ color, whiteSpace: "pre-wrap", display: "block" }}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

const STATUS_COLOR: Record<ChangeDto["status"], string> = {
  pending: "var(--accent)",
  applied: "var(--good)",
  reverted: "var(--ink-3)",
};

/** Circular session-context gauge; clicking opens the context view. */
function ContextRing({ pct, active, onClick }: { pct: number; active: boolean; onClick: () => void }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Close context" : "Open context — session context usage"}
      aria-pressed={active}
      title="Session context"
      className="grid h-[22px] w-[22px] place-items-center rounded-full"
      style={{ boxShadow: active ? "inset 0 0 0 2px var(--accent)" : undefined }}
    >
      <svg viewBox="0 0 20 20" className="h-full w-full -rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" stroke="var(--hairline)" strokeWidth="2.4" />
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
        />
      </svg>
    </button>
  );
}

function OptionsMenu({
  onContext,
  onExport,
}: {
  onContext: () => void;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip"
        aria-label="Session options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-pop right-0 top-full mt-1" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onContext();
            }}
          >
            Context
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            <Download size={14} aria-hidden="true" />
            Export session
          </button>
        </div>
      )}
    </div>
  );
}

const fmtStamps = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
      <span className="mono text-[12.5px] text-right">{value}</span>
    </div>
  );
}

/** Draggable sash: 1:1 pointer tracking with pointer capture (Apple-style direct manipulation). */
function Sash({
  onDelta,
  ariaLabel,
}: {
  onDelta: (dx: number) => void;
  ariaLabel: string;
}) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = e.clientX;
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const dx = e.clientX - last.current;
      last.current = e.clientX;
      onDelta(dx);
    },
    [dragging, onDelta],
  );

  const end = useCallback(() => setDragging(false), []);

  return (
    <button
      type="button"
      className="col-sash hidden self-stretch lg:block"
      data-dragging={dragging}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onDelta(-16);
        if (e.key === "ArrowRight") onDelta(16);
      }}
    />
  );
}

export default function ProjectBuilder({
  projectId,
  initialFiles,
  initialChanges,
  initialNotice,
  initialPrompt,
  readiness = [],
}: {
  projectId: string;
  initialFiles: ProjectFileDto[];
  initialChanges: ChangeDto[];
  initialNotice?: string;
  initialPrompt?: string;
  readiness?: ModelReadiness[];
}) {
  const [files, setFiles] = useState<ProjectFileDto[]>(initialFiles);
  const [changes, setChanges] = useState<ChangeDto[]>(initialChanges);
  const [selected, setSelected] = useState<string>(initialFiles[0]?.path ?? "");
  const [content, setContent] = useState(initialFiles[0]?.content ?? "");
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [mode, setMode] = useState<RunMode>("Build");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(initialNotice ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [log, setLog] = useState<string[]>([]);
  const initialPromptSubmittedRef = useRef(false);

  // Auto-submit initial prompt on first load
  useEffect(() => {
    if (initialPrompt && !initialPromptSubmittedRef.current && !busy) {
      initialPromptSubmittedRef.current = true;
      setPrompt(initialPrompt);
      runAgent();
    }
  }, [initialPrompt, busy]);

  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolsW, setToolsW] = useState(400);
  const [toolTab, setToolTab] = useState<ToolTab>("editor");

  // Session context tracking — resets on reload (this is a per-session panel).
  const [tab, setTab] = useState<null | "context">(null);
  const [runs, setRuns] = useState<
    { prompt: string; createdAt: Date; usage?: TokenUsage; creditsSpent?: number; freeTokensUsed?: number }[]
  >([]);
  const [sessionStart] = useState(() => new Date());

  const filesByPath = useMemo(
    () => Object.fromEntries(files.map((f) => [f.path, f.content])),
    [files],
  );

  const totals = useMemo(
    () =>
      runs.reduce(
        (acc, r) => ({
          inputTokens: acc.inputTokens + (r.usage?.inputTokens ?? 0),
          outputTokens: acc.outputTokens + (r.usage?.outputTokens ?? 0),
          reasoningTokens: acc.reasoningTokens + (r.usage?.reasoningTokens ?? 0),
          cacheReadTokens: acc.cacheReadTokens + (r.usage?.cacheReadTokens ?? 0),
          totalTokens: acc.totalTokens + (r.usage?.totalTokens ?? 0),
          creditsSpent: acc.creditsSpent + (r.creditsSpent ?? 0),
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          creditsSpent: 0,
        },
      ),
    [runs],
  );

  const currentModel = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const contextPct =
    currentModel.contextLimit > 0
      ? Math.min(100, (totals.totalTokens / currentModel.contextLimit) * 100)
      : 0;

  function exportSession() {
    const lines = [
      `Vibecoder session export`,
      `Model: ${currentModel.label}`,
      `Provider: ${PROVIDER_META[currentModel.provider].label}`,
      `Session created: ${fmtStamps.format(sessionStart)}`,
      `Messages: ${runs.length}`,
      `Total tokens: ${totals.totalTokens}`,
      `Input: ${totals.inputTokens} · Output: ${totals.outputTokens}`,
      `Credits spent: ${totals.creditsSpent}`,
      ``,
      ...runs.map((run, i) => `[${i + 1}] ${fmtStamps.format(run.createdAt)} — ${run.prompt}`),
      ``,
      ...changes.map((c) => `Change (${c.status}) ${c.path}`),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibecoder-session-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function pick(path: string) {
    setSelected(path);
    setContent(filesByPath[path] ?? "");
    setToolTab("editor");
  }

  function autoresize() {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }

  async function attachFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added = await Promise.all(
      Array.from(list).map(async (f, i) => {
        const isImg = f.type.startsWith("image/");
        let url: string | undefined;
        let dataUrl: string | undefined;
        try {
          url = URL.createObjectURL(f);
          if (isImg && f.size <= 1_500_000) {
            dataUrl = await readAsDataUrl(f).catch(() => undefined);
          }
        } catch {
          url = undefined;
        }
        return {
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          type: f.type || "file",
          size: f.size,
          url: isImg ? url : undefined,
          dataUrl,
        };
      }),
    );
    setAttachments((prev) => [...prev, ...added]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  function workingLabel(): string {
    if (busy) return mode === "Plan" ? "Planning…" : mode === "Design" ? "Designing…" : "Building…";
    return mode;
  }

  // Tools sit to the right of the chat; dragging the sash right narrows them.
  const nudgeTools = useCallback((dx: number) => {
    setToolsW((w) => Math.min(720, Math.max(280, w - dx)));
  }, []);

  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setStatus("");
    const res = await fetch(
      `/api/app/projects/${projectId}/files/${encodeURIComponent(selected).replace(/%2F/g, "/")}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    setBusy(false);
    if (res.ok) {
      setFiles((prev) => prev.map((f) => (f.path === selected ? { ...f, content } : f)));
      setStatus("Saved.");
    } else {
      setStatus("Save failed.");
    }
  }

  async function readStream(res: Response): Promise<{
    ok: boolean; error?: string; notice?: string; modelLabel?: string; usedFallback?: boolean; creditsSpent?: number; usage?: TokenUsage; prompt?: { changes: ChangeDto[] };
  } | null> {
    if (!res.headers.get("content-type")?.includes("text/event-stream")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let buf = "";
    let result: { ok: boolean; error?: string; notice?: string; modelLabel?: string; usedFallback?: boolean; creditsSpent?: number; usage?: TokenUsage; prompt?: { changes: ChangeDto[] } } | null = null;
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
          const msg = JSON.parse(line.slice(6)) as { type: string; message?: string; error?: string; notice?: string; modelLabel?: string; usedFallback?: boolean; usage?: TokenUsage; prompt?: { changes: ChangeDto[] }; ok?: boolean };
          if (msg.type === "status" || msg.type === "heartbeat") {
            if (msg.message) { setStatus(msg.message); setLog((p) => [...p.slice(-18), msg.message!]); }
          } else if (msg.type === "error") {
            result = { ok: false, error: msg.error, notice: msg.notice };
            return result;
          } else if (msg.type === "done") {
            result = msg as unknown as typeof result & { ok: true };
            return result;
          }
        } catch {}
      }
    }
    return result;
  }

  async function runAgent(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    const attachCount = attachments.length;
    setBusy(true);
    setLog([mode === "Plan" ? "Planning…" : mode === "Design" ? "Designing…" : "Sending prompt…"]);
    setStatus(mode === "Plan" ? "Planning…" : mode === "Design" ? "Designing…" : "Agent is building…");
    setNotice("");
    const res = await fetch(`/api/app/projects/${projectId}/prompt/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: text,
        modelId,
        attachments: attachments.length
          ? attachments.map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl }))
          : undefined,
      }),
    });
    let data: { ok: boolean; error?: string; notice?: string; modelLabel?: string; usedFallback?: boolean; creditsSpent?: number; usage?: TokenUsage; prompt?: { changes: ChangeDto[] } } | null = await readStream(res);
    if (!data) {
      // fallback: non-streaming JSON (keeps old route usable)
      const fallbackRes = res.headers.get("content-type")?.includes("application/json") ? res : await fetch(`/api/app/projects/${projectId}/prompt`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, modelId, attachments: attachments.length ? attachments.map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl })) : undefined }),
      });
      data = (await fallbackRes.json()) as typeof data & { ok: boolean };
    }
    setBusy(false);
    if (!data || !data.ok || !data.prompt) {
      setStatus((data as { error?: string })?.error ?? "The agent did not return changes.");
      setLog((p) => [...p, `Error: ${(data as { error?: string })?.error ?? "no changes"}`]);
      return;
    }
    setChanges((prev) => [...prev, ...data.prompt!.changes]);
    setPrompt("");
    for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
    setAttachments([]);
    setLog((p) => [...p, `Done — ${data.prompt!.changes.length} file(s): ${data.prompt!.changes.map((c) => c.path).join(", ")}`]);
    setRuns((prev) => [...prev, { prompt: text, createdAt: new Date(), usage: data!.usage, creditsSpent: data!.creditsSpent }]);
    const bits: string[] = [];
    bits.push(`${data.modelLabel ?? "Agent"} proposed ${data.prompt.changes.length} change(s): ${data.prompt.changes.map((c) => c.path).join(", ")}.`);
    if (attachCount > 0) bits.push(`with ${attachCount} attachment${attachCount === 1 ? "" : "s"}.`);
    if (data.creditsSpent) bits.push(`−${data.creditsSpent} credits.`);
    if (data.usedFallback) bits.push("Out of credits — ran the free model.");
    setStatus(bits.join(" "));
    if (data.notice) setNotice(data.notice);
    // show the outcome right away
    setToolTab("files");
  }

  async function act(change: ChangeDto, action: "apply" | "revert") {
    if (busy) return;
    setBusy(true);
    setStatus("");
    const res = await fetch(`/api/app/projects/${projectId}/changes/${change.id}/${action}`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      setStatus(`${action} failed.`);
      return;
    }
    const next = action === "apply" ? change.after : change.before;
    const statusValue = action === "apply" ? ("applied" as const) : ("reverted" as const);
    setChanges((prev) =>
      prev.map((c) => (c.id === change.id ? { ...c, status: statusValue } : c)),
    );
    setFiles((prev) =>
      prev.map((f) => (f.path === change.path ? { ...f, content: next } : f)),
    );
    if (selected === change.path) setContent(next);
    setStatus(action === "apply" ? "Change applied." : "Change reverted.");
  }

  const pendingCount = changes.filter((c) => c.status === "pending").length;

  function handlePresetApplied(file: { path: string; content: string }) {
    setFiles((prev) => {
      const exists = prev.some((f) => f.path === file.path);
      return exists
        ? prev.map((f) => (f.path === file.path ? { ...f, content: file.content } : f))
        : [...prev, file];
    });
    if (selected === file.path) setContent(file.content);
  }

  return (
    <div className="flex min-w-0 flex-1" style={{ alignItems: "stretch" }}>
      {/* Chat — fills the available width; independent panel (no tabs): status · context circle · ⋯ menu */}
      <aside
        aria-label="Chat"
        className="card flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-3 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <h2 className="text-[13px] font-semibold">Agent</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="chip"
              aria-label={toolsOpen ? "Hide workspace tools" : "Show workspace tools"}
              aria-pressed={toolsOpen}
              title={toolsOpen ? "Hide the workspace tools panel" : "Show the workspace tools panel"}
              onClick={() => setToolsOpen((o) => !o)}
            >
              {toolsOpen ? (
                <PanelRightClose size={14} aria-hidden="true" />
              ) : (
                <PanelRightOpen size={14} aria-hidden="true" />
              )}
            </button>
            <span
              className="hidden text-[12px] sm:inline"
              style={{ color: busy ? "var(--accent)" : "var(--ink-3)" }}
              role="status"
            >
              {busy ? "working…" : pendingCount > 0 ? `${pendingCount} pending` : "idle"}
            </span>
            <ContextRing
              pct={contextPct}
              active={tab === "context"}
              onClick={() => setTab(tab === "context" ? null : "context")}
            />
            <OptionsMenu onContext={() => setTab("context")} onExport={exportSession} />
          </div>
        </div>

        {(status || notice) && tab !== "context" && (
          <div
            className="mx-3 mt-2 rounded-lg px-3 py-2 text-[13px]"
            style={{ background: "var(--bg-inset)" }}
            aria-live="polite"
          >
            {status && <p style={{ color: "var(--ink-2)" }}>{status}</p>}
            {notice && (
              <p className="mt-1" style={{ color: "var(--good)" }}>
                {notice}
              </p>
            )}
          </div>
        )}
        {(busy || log.length > 0) && tab !== "context" && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-inset)", border: "1px solid var(--hairline)" }} aria-live="polite">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>{busy ? "Working" : "Last run"}</p>
            <ul className="mono space-y-0.5 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {log.map((m, i) => (<li key={i}>› {m}</li>))}
            </ul>
            {busy && <p className="mt-1 mono text-[11px]" style={{ color: "var(--ink-3)" }}>This can take up to ~30s. You’ll see the files as soon as it’s done.</p>}
          </div>
        )}

        {tab === "context" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                Context
              </h3>
              <button type="button" className="chip" aria-label="Close context" onClick={() => setTab(null)}>
                <X size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--bg-inset)" }}>
                <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90">
                  <circle cx="20" cy="20" r="17" fill="none" stroke="var(--hairline)" strokeWidth="3" />
                  <circle
                    cx="20"
                    cy="20"
                    r="17"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(contextPct / 100) * (2 * Math.PI * 17)} ${2 * Math.PI * 17}`}
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                    Usage
                  </p>
                  <p className="text-[15px] font-semibold">{contextPct.toFixed(0)}%</p>
                </div>
                <div className="text-right">
                  <p className="mono text-[12.5px]">{totals.totalTokens.toLocaleString()}</p>
                  <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                    of {currentModel.contextLimit.toLocaleString()} tokens
                  </p>
                </div>
              </div>

              <StatRow label="Model" value={currentModel.label} />
              <StatRow label="Provider" value={PROVIDER_META[currentModel.provider].label} />
              <StatRow label="Context Limit" value={currentModel.contextLimit.toLocaleString()} />
              <StatRow label="Total Tokens" value={totals.totalTokens.toLocaleString()} />
              <StatRow label="Input Tokens" value={totals.inputTokens.toLocaleString()} />
              <StatRow label="Output Tokens" value={totals.outputTokens.toLocaleString()} />
              <StatRow label="Reasoning Tokens" value={totals.reasoningTokens.toLocaleString()} />
              <StatRow label="Cache Tokens (read)" value={totals.cacheReadTokens.toLocaleString()} />
              <StatRow label="Messages" value={String(runs.length)} />
              <StatRow label="Session Created" value={fmtStamps.format(sessionStart)} />
              <StatRow
                label="Total Cost"
                value={`$${((totals.creditsSpent * 0.1) / 1).toFixed(2)} · ${totals.creditsSpent} cr`}
              />

              {runs.length > 0 && (
                <div className="pt-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                    Runs
                  </p>
                  <div className="flex flex-col gap-1">
                    {runs.map((run, i) => (
                      <p key={i} className="mono truncate text-[12px]" style={{ color: "var(--ink-2)" }}>
                        · {fmtStamps.format(run.createdAt)} — {run.prompt}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3" aria-live="polite">
            {changes.length === 0 && !status && (
              <div className="px-1 pt-6 text-center">
                <FilePlus2 size={20} aria-hidden="true" className="mx-auto mb-2" style={{ color: "var(--ink-3)" }} />
                <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                  Describe what you want below. The agent proposes file changes here — apply or revert each one.
                </p>
              </div>
            )}

            {changes.map((c) => (
              <div key={c.id} className="rounded-xl p-3" style={{ background: "var(--bg-inset)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="mono truncate text-[12.5px]">{c.path}</span>
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: STATUS_COLOR[c.status] }}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  {c.status === "pending" && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => act(c, "apply")} disabled={busy}>
                      Apply
                    </button>
                  )}
                  {c.status === "applied" && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(c, "revert")} disabled={busy}>
                      Revert
                    </button>
                  )}
                  {c.status === "reverted" && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(c, "apply")} disabled={busy}>
                      Re-apply
                    </button>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12px] hover:opacity-70" style={{ color: "var(--ink-3)" }}>
                    Diff
                  </summary>
                  <DiffLines c={c} />
                </details>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={runAgent} className="shrink-0 p-3 pt-0">
          <div className="mb-2 flex items-center gap-2">
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "var(--bg-inset)" }}
              role="tablist"
              aria-label="Agent mode"
            >
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className="rounded-md px-2.5 py-1 text-[12px] font-semibold"
                  style={mode === m ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--ink-2)" }}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <span
              className="hidden text-[11px] sm:inline"
              style={{ color: "var(--ink-3)" }}
            >
              ↩
            </span>
          </div>

          <label htmlFor="builder-prompt" className="sr-only">
            Tell the agent what to build
          </label>
          <textarea
            id="builder-prompt"
            ref={boxRef}
            className="input w-full resize-none text-[14px]"
            style={{ minHeight: 60, height: 60, maxHeight: COMPOSER_MAX_HEIGHT, overflowY: "hidden" }}
            placeholder="Tell the agent what to build…"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              autoresize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runAgent();
              }
            }}
          />

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
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
                  <span className="shrink-0" style={{ color: "var(--ink-3)" }}>
                    {fmtSize(a.size)}
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:opacity-70"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeAttachment(a.id)}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.csv,.svg,.zip,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.webm"
              onChange={(e) => {
                void attachFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="chip"
              aria-label="Attach images, videos or files"
              title="Attach images, videos or files"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={14} aria-hidden="true" />
            </button>
            <ModelPicker
              value={modelId}
              onChange={setModelId}
              readiness={readiness}
            />
            <button type="submit" className="btn btn-primary btn-sm ml-auto" disabled={busy || !prompt.trim()}>
              {workingLabel()}
            </button>
          </div>
        </form>
      </aside>

      <Sash onDelta={nudgeTools} ariaLabel="Resize workspace tools" />

      {/* Tools — all other tabs (Files, Editor, Preview, UI Presets, Integrations) */}
      {toolsOpen && (
        <aside
          className="card flex shrink-0 flex-col overflow-hidden"
          aria-label="Workspace"
          style={{ width: toolsW, minWidth: 0, maxWidth: 720 }}
        >
        <div
          className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5"
          style={{ borderColor: "var(--hairline)" }}
          role="tablist"
          aria-label="Workspace"
        >
          {TOOL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={toolTab === t.id}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium"
              style={
                toolTab === t.id
                  ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }
                  : { color: "var(--ink-2)", opacity: 0.75 }
              }
              onClick={() => setToolTab(t.id)}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>

        {toolTab === "files" ? (
          <div className="flex min-h-0 flex-1 flex-col" aria-label="Project files">
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
                Files
              </h2>
              <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                {files.length}
              </span>
            </div>
            <ul className="flex-1 overflow-y-auto p-2">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => pick(f.path)}
                    className="mono w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-white/5"
                    aria-current={f.path === selected ? "true" : undefined}
                    style={
                      f.path === selected
                        ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }
                        : { color: "var(--ink-2)" }
                    }
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : toolTab === "editor" ? (
          <div className="flex min-h-0 flex-1 flex-col" aria-label="Editor">
            <div
              className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <span className="mono truncate text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                {selected || "select a file"}
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!selected || busy}>
                Save
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {selected ? (
                <FileEditor path={selected} value={content} onChange={setContent} />
              ) : (
                <p className="muted p-4 text-sm">Select a file to edit it.</p>
              )}
            </div>
          </div>
        ) : toolTab === "preview" ? (
          <PreviewPane files={filesByPath} />
        ) : toolTab === "presets" ? (
          <UiPresetsPanel projectId={projectId} onApplied={handlePresetApplied} />
        ) : (
          <IntegrationsPanel />
        )}
        </aside>
      )}
    </div>
  );
}