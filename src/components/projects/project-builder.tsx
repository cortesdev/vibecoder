"use client";

import { useMemo, useState } from "react";
import { createTwoFilesPatch } from "diff";
import FileEditor from "./editor";

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

/** Colored diff: green additions, red deletions, dim context. */
function DiffLines({ c }: { c: ChangeDto }) {
  return (
    <pre
      className="mono mt-2 max-h-56 overflow-auto rounded-lg p-2 text-[12px] leading-[1.6]"
      style={{ background: "var(--bg-inset)" }}
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

export default function ProjectBuilder({
  projectId,
  initialFiles,
  initialChanges,
}: {
  projectId: string;
  initialFiles: ProjectFileDto[];
  initialChanges: ChangeDto[];
}) {
  const [files, setFiles] = useState<ProjectFileDto[]>(initialFiles);
  const [changes, setChanges] = useState<ChangeDto[]>(initialChanges);
  const [selected, setSelected] = useState<string>(initialFiles[0]?.path ?? "");
  const [content, setContent] = useState(initialFiles[0]?.content ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const filesByPath = useMemo(
    () => Object.fromEntries(files.map((f) => [f.path, f.content])),
    [files],
  );

  function pick(path: string) {
    setSelected(path);
    setContent(filesByPath[path] ?? "");
  }

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

  async function runAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStatus("Agent is working…");
    const res = await fetch(`/api/app/projects/${projectId}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = (await res.json()) as
      | { ok: boolean; error?: string; prompt?: { changes: ChangeDto[] } };
    setBusy(false);
    if (!res.ok || !data.ok || !data.prompt) {
      setStatus(data.error ?? "The agent did not return changes.");
      return;
    }
    setChanges((prev) => [...prev, ...data.prompt!.changes]);
    setPrompt("");
    setStatus(`Prepared ${data.prompt.changes.length} change(s), ready for review.`);
  }

  async function act(change: ChangeDto, action: "apply" | "revert") {
    if (busy) return;
    setBusy(true);
    setStatus("");
    const res = await fetch(
      `/api/app/projects/${projectId}/changes/${change.id}/${action}`,
      { method: "POST" },
    );
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

  return (
    <div
      className="grid gap-3 lg:h-[calc(100dvh-150px)] lg:grid-cols-[190px_minmax(0,1fr)_400px]"
      aria-label="Project builder"
    >
      {/* ── Files ─────────────────────────────────────────────────────── */}
      <aside
        aria-label="Project files"
        className="card flex flex-row gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-y-auto"
      >
        <h2 className="sr-only">Files</h2>
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => pick(f.path)}
            className="mono shrink-0 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-white/5 lg:w-full lg:shrink"
            aria-current={f.path === selected ? "true" : undefined}
            style={
              f.path === selected
                ? { background: "rgba(232,72,63,0.14)", color: "var(--accent)" }
                : { color: "var(--ink-2)" }
            }
          >
            {f.path}
          </button>
        ))}
      </aside>

      {/* ── Editor ────────────────────────────────────────────────────── */}
      <section className="card flex min-h-0 flex-col overflow-hidden" aria-label="Editor">
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span className="mono truncate text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {selected || "select a file"}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={!selected || busy}
          >
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

      {/* ── Agent chat ────────────────────────────────────────────────── */}
      <aside
        className="card flex min-h-0 flex-col overflow-hidden"
        aria-label="Agent"
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <h2 className="text-[13px] font-semibold">Agent</h2>
          <span className="text-[12px]" style={{ color: busy ? "var(--accent)" : "var(--ink-3)" }} role="status">
            {busy ? "working…" : "idle"}
          </span>
        </div>

        {/* Conversation: the agent's proposed changes, newest intent first */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3" aria-live="polite">
          {status && (
            <p className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)", color: "var(--ink-2)" }}>
              {status}
            </p>
          )}

          {changes.length === 0 && !status && (
            <div className="px-1 pt-6 text-center">
              <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                Describe what you want below. The agent proposes file changes here — you apply or revert each one.
              </p>
            </div>
          )}

          {changes.map((c) => (
            <div key={c.id} className="rounded-xl p-3" style={{ background: "var(--bg-inset)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="mono truncate text-[12.5px]">{c.path}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: STATUS_COLOR[c.status] }}>
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

        {/* Prompt: pinned to the bottom, chat-style */}
        <form onSubmit={runAgent} className="shrink-0 p-3 pt-0" style={{ borderTop: "1px solid var(--hairline)" }}>
          <label htmlFor="prompt" className="sr-only">
            Tell the agent what to build
          </label>
          <textarea
            id="prompt"
            className="input min-h-[60px] w-full resize-none text-[14px]"
            placeholder="Tell the agent what to build…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              ⌘↩ to send
            </span>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !prompt.trim()}>
              {busy ? "Working…" : "Run agent"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
