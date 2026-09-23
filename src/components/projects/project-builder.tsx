"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { Download, FilePlus2, Globe, MessageCircle, MoreHorizontal, Palette, Plug, X } from "lucide-react";
import FileEditor from "./editor";
import ModelPicker, { useOutsideClose } from "@/components/app/model-picker";
import PreviewPane from "./preview-pane";
import UiPresetsPanel from "./ui-presets-panel";
import IntegrationsPanel from "./integrations-panel";
import { MODELS, PROVIDER_META } from "@/lib/models";
import type { TokenUsage } from "@/lib/agent/types";

type WorkTab = "chat" | "preview" | "presets" | "integrations";
const WORK_TABS = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "preview", label: "Preview", icon: Globe },
  { id: "presets", label: "UI Presets", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
] satisfies { id: WorkTab; label: string; icon: typeof MessageCircle }[];

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

/** Circular session-context gauge; clicking opens the context tab. */
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
  balance,
}: {
  projectId: string;
  initialFiles: ProjectFileDto[];
  initialChanges: ChangeDto[];
  initialNotice?: string;
  balance: number;
}) {
  const [files, setFiles] = useState<ProjectFileDto[]>(initialFiles);
  const [changes, setChanges] = useState<ChangeDto[]>(initialChanges);
  const [selected, setSelected] = useState<string>(initialFiles[0]?.path ?? "");
  const [content, setContent] = useState(initialFiles[0]?.content ?? "");
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState("big-pickle");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(initialNotice ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");

  const [treeW, setTreeW] = useState(190);
  const [chatW, setChatW] = useState(400);

  // Session context tracking — resets on reload (this is a per-session panel).
  const [workTab, setWorkTab] = useState<WorkTab>("chat");
  const [tab, setTab] = useState<null | "context">(null);
  const [runs, setRuns] = useState<
    { prompt: string; createdAt: Date; usage?: TokenUsage; creditsSpent?: number }[]
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
  }

  const nudgeTree = useCallback((dx: number) => {
    setTreeW((w) => Math.min(420, Math.max(140, w + dx)));
  }, []);
  const nudgeChat = useCallback((dx: number) => {
    setChatW((w) => Math.min(640, Math.max(300, w - dx)));
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

  async function runAgent(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setStatus("Agent is working…");
    setNotice("");
    const res = await fetch(`/api/app/projects/${projectId}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: text, modelId }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      notice?: string;
      modelLabel?: string;
      usedFallback?: boolean;
      creditsSpent?: number;
      usage?: TokenUsage;
      prompt?: { changes: ChangeDto[] };
    };
    setBusy(false);
    if (!res.ok || !data.ok || !data.prompt) {
      setStatus(data.error ?? "The agent did not return changes.");
      return;
    }
    setChanges((prev) => [...prev, ...data.prompt!.changes]);
    setPrompt("");
    setRuns((prev) => [
      ...prev,
      { prompt: text, createdAt: new Date(), usage: data.usage, creditsSpent: data.creditsSpent },
    ]);
    const bits: string[] = [];
    bits.push(`${data.modelLabel ?? "Agent"} proposed ${data.prompt.changes.length} change(s).`);
    if (data.creditsSpent) bits.push(`−${data.creditsSpent} credits.`);
    if (data.usedFallback) bits.push("Out of credits — ran the free model.");
    setStatus(bits.join(" "));
    setNotice(data.notice ?? "");
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
    <div className="flex min-h-[calc(100dvh-150px)] gap-0" style={{ alignItems: "stretch" }}>
        {/* Workspace panel (tabs: Chat · Preview · UI Presets · Integrations) */}
      <aside
        className="card flex shrink-0 flex-col overflow-hidden"
        style={{ width: chatW, minWidth: 300, maxWidth: 640 }}
        aria-label="Workspace"
      >
        <div
          className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5"
          style={{ borderColor: "var(--hairline)" }}
          role="tablist"
          aria-label="Workspace"
        >
          {WORK_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={workTab === t.id}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium"
              style={
                workTab === t.id
                  ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }
                  : { color: "var(--ink-2)", opacity: 0.75 }
              }
              onClick={() => setWorkTab(t.id)}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            {workTab === "chat" && (
              <span className="hidden text-[11px] sm:inline" style={{ color: busy ? "var(--accent)" : "var(--ink-3)" }} role="status">
                {busy ? "working…" : pendingCount > 0 ? `${pendingCount} pending` : "idle"}
              </span>
            )}
            <ContextRing
              pct={contextPct}
              active={tab === "context" && workTab === "chat"}
              onClick={() => {
                if (workTab !== "chat") setWorkTab("chat");
                setTab(tab === "context" ? null : "context");
              }}
            />
            <OptionsMenu
              onContext={() => {
                setWorkTab("chat");
                setTab("context");
              }}
              onExport={exportSession}
            />
          </div>
        </div>

        {workTab === "chat" ? (
          <>
        {(status || notice) && tab !== "context" && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)" }} aria-live="polite">
            {status && <p style={{ color: "var(--ink-2)" }}>{status}</p>}
            {notice && (
              <p className="mt-1" style={{ color: "var(--good)" }}>
                {notice}
              </p>
            )}
          </div>
        )}

        {tab === "context" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
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
          <label htmlFor="builder-prompt" className="sr-only">
            Tell the agent what to build
          </label>
          <textarea
            id="builder-prompt"
            className="input min-h-[60px] w-full resize-none text-[14px]"
            placeholder="Tell the agent what to build…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runAgent();
              }
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <ModelPicker value={modelId} onChange={setModelId} balance={balance} />
            <span className="hidden text-[11px] sm:inline" style={{ color: "var(--ink-3)" }}>
              ↩
            </span>
            <button type="submit" className="btn btn-primary btn-sm ml-auto" disabled={busy || !prompt.trim()}>
              {busy ? "Working…" : "Run agent"}
            </button>
          </div>
        </form>

        </>
        ) : workTab === "preview" ? (
          <PreviewPane files={filesByPath} />
        ) : workTab === "presets" ? (
          <UiPresetsPanel projectId={projectId} onApplied={handlePresetApplied} />
        ) : (
          <IntegrationsPanel />
        )}
      </aside>
      
      {/* Files tree */}
      <aside
        aria-label="Project files"
        className="card flex shrink-0 flex-col overflow-hidden"
        style={{ width: treeW, minWidth: 140, maxWidth: 420 }}
      >
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
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
      </aside>

      <Sash onDelta={nudgeTree} ariaLabel="Resize file tree" />

      {/* Editor column */}
      <section className="card flex min-w-0 flex-1 flex-col overflow-hidden" aria-label="Editor">
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
        <div className="min-h-[420px] flex-1 lg:min-h-0">
          {selected ? (
            <FileEditor path={selected} value={content} onChange={setContent} />
          ) : (
            <p className="muted p-4 text-sm">Select a file to edit it.</p>
          )}
        </div>
      </section>

      <Sash onDelta={nudgeChat} ariaLabel="Resize agent panel" />

    
    </div>
  );
}
