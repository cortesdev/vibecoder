"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { FilePlus2 } from "lucide-react";
import FileEditor from "./editor";
import ModelPicker from "@/components/app/model-picker";

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

  const filesByPath = useMemo(
    () => Object.fromEntries(files.map((f) => [f.path, f.content])),
    [files],
  );

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
      prompt?: { changes: ChangeDto[] };
    };
    setBusy(false);
    if (!res.ok || !data.ok || !data.prompt) {
      setStatus(data.error ?? "The agent did not return changes.");
      return;
    }
    setChanges((prev) => [...prev, ...data.prompt!.changes]);
    setPrompt("");
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

  return (
    <div className="flex min-h-[calc(100dvh-150px)] gap-0" style={{ alignItems: "stretch" }}>
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

      {/* Agent chat panel */}
      <aside
        className="card flex shrink-0 flex-col overflow-hidden"
        style={{ width: chatW, minWidth: 300, maxWidth: 640 }}
        aria-label="Agent"
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
          <h2 className="text-[13px] font-semibold">Agent</h2>
          <span className="text-[12px]" style={{ color: busy ? "var(--accent)" : "var(--ink-3)" }} role="status">
            {busy ? "working…" : pendingCount > 0 ? `${pendingCount} pending` : "idle"}
          </span>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-3" aria-live="polite">
          {(status || notice) && (
            <div className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)" }}>
              {status && <p style={{ color: "var(--ink-2)" }}>{status}</p>}
              {notice && (
                <p className="mt-1" style={{ color: "var(--good)" }}>
                  {notice}
                </p>
              )}
            </div>
          )}

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
      </aside>
    </div>
  );
}
