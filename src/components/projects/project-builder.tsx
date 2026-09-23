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

function changeDiff(c: ChangeDto): string {
  return createTwoFilesPatch(`a/${c.path}`, `b/${c.path}`, c.before, c.after, "", "", {
    context: 3,
  });
}

export default function ProjectBuilder({
  projectId,
  projectName,
  initialFiles,
  initialChanges,
}: {
  projectId: string;
  projectName: string;
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
    const res = await fetch(`/api/app/projects/${projectId}/files/${encodeURIComponent(selected).replace(/%2F/g, "/")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
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
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "calc(100dvh - 140px)" }}>
      {/* Sidebar: file tree */}
      <aside aria-label="Project files" className="border-r p-3" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide muted">{projectName}</h2>
        <ul className="mt-3 space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => pick(f.path)}
                className="mono w-full truncate rounded-md px-2 py-1 text-left text-[13px] hover:bg-white/5"
                aria-current={f.path === selected ? "true" : undefined}
                style={
                  f.path === selected
                    ? { background: "rgba(232,72,63,0.12)", color: "var(--accent)" }
                    : undefined
                }
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main: editor + agent column */}
      <section className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: "var(--hairline)" }}>
          <span className="mono text-[13px] muted">{selected || "select a file"}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!selected || busy}>
            Save
          </button>
        </div>

        <div className="min-h-[320px] flex-1 p-1">
          {selected ? (
            <FileEditor path={selected} value={content} onChange={setContent} />
          ) : (
            <p className="muted p-4">Select a file to edit it.</p>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--hairline)" }}>
          <form onSubmit={runAgent} className="flex gap-2">
            <label htmlFor="prompt" className="sr-only">
              Tell the agent what to build
            </label>
            <textarea
              id="prompt"
              className="input min-h-[64px] flex-1 resize-y"
              placeholder="Tell the agent what to build, e.g. add a sign-up button with dark styling…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              {busy ? "Working…" : "Run agent"}
            </button>
          </form>

          <p aria-live="polite" className="mt-2 text-sm muted">
            {status || "\u00A0"}
          </p>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide muted">Proposed changes</h3>
            <ul className="mt-2 space-y-2">
              {changes.length === 0 && <li className="text-sm muted">No changes yet.</li>}
              {changes.map((c) => (
                <li key={c.id} className="card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono text-[13px]">{c.path}</span>
                    <span className="badge" style={{ color: c.status === "applied" ? "var(--good)" : c.status === "reverted" ? "var(--ink-3)" : "var(--accent)" }}>
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
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
                    <summary className="cursor-pointer text-xs muted hover:opacity-70">Show diff</summary>
                    <pre className="mono mt-2 max-h-64 overflow-auto rounded-lg p-2 text-[12px]" style={{ background: "var(--bg-inset)" }}>
                      {changeDiff(c)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}