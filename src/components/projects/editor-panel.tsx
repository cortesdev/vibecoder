"use client";

import { useState } from "react";

// File editor: edit, save with conflict detection, diagnostics list. Unsaved
// text lives in the parent store, so tab switches never lose it.

export interface EditorDiagnostics {
  message: string;
}

export default function EditorPanel({
  projectId,
  path,
  savedContent,
  draft,
  onDraft,
  onSaved,
  diagnostics = [],
}: {
  projectId: string;
  path: string | null;
  savedContent: string;
  draft: string | undefined;
  onDraft: (path: string, text: string) => void;
  onSaved: (path: string, content: string) => void;
  diagnostics?: EditorDiagnostics[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const text = draft ?? savedContent;
  const dirty = draft !== undefined && draft !== savedContent;

  // NOTE: the parent keys this panel by path, so a different selection
  // mounts a fresh session — no reset effect needed here.

  if (!path) {
    return (
      <div className="flex-1 p-4">
        <p className="px-1 pt-10 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
          Pick a file from the Files tab to edit it.
        </p>
      </div>
    );
  }
  // Narrowed once for every closure below (props don't narrow in callbacks).
  const currentPath: string = path;

  async function save(overwrite = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/app/projects/${projectId}/files/${currentPath.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, ...(overwrite ? {} : { expectedContent: savedContent }) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; current?: string } | null;
      if (res.status === 409) {
        setConflict(typeof data?.current === "string" ? data.current : "");
        return;
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Save failed.");
      setConflict(null);
      onSaved(currentPath, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="mono truncate text-[12.5px]">{path}</span>
        {dirty && (
          <span className="text-[11px]" style={{ color: "var(--warn)" }} aria-label="Unsaved changes">
            ● unsaved
          </span>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {diagnostics.length > 0 && (
        <ul className="shrink-0 space-y-1 px-4 py-2" aria-label="File diagnostics">
          {diagnostics.map((d, i) => (
            <li key={i} role="alert" className="text-[12px]" style={{ color: "var(--accent)" }}>
              {d.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="shrink-0 px-4 py-1 text-[12px]" style={{ color: "var(--accent)" }}>
          {error}
        </p>
      )}
      {conflict !== null && (
        <div className="shrink-0 px-4 py-2 text-[12px]" role="alert" style={{ background: "var(--bg-inset)" }}>
          <p style={{ color: "var(--warn)" }}>
            Someone changed this file since you opened it. Your text is intact below — nothing was overwritten.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void save(true)} disabled={busy}>
              Overwrite with mine
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onSaved(currentPath, conflict);
                setConflict(null);
              }}
              disabled={busy}
            >
              Reload theirs
            </button>
          </div>
        </div>
      )}
      <label htmlFor="workspace-editor" className="sr-only">
        Edit {currentPath}
      </label>
      <textarea
        id="workspace-editor"
        className="mono min-h-0 flex-1 resize-none bg-transparent p-4 text-[13px] leading-relaxed outline-none"
        style={{ color: "var(--ink)" }}
        value={text}
        onChange={(e) => onDraft(currentPath, e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            void save();
          }
        }}
        spellCheck={false}
      />
    </div>
  );
}
