"use client";

import { useState } from "react";
import { ExportButton } from "./workspace-shared";
import type { ProjectFileDto } from "./workspace-shared";

// Files panel: navigate, open, create, rename, delete, export. Every mutation
// reports back so the parent store stays the single source of truth.

export interface FilesMutation {
  type: "created" | "renamed" | "deleted";
  path: string;
  content?: string;
  from?: string;
}

export default function FilesPanel({
  projectId,
  files,
  selected,
  onSelect,
  onMutated,
}: {
  projectId: string;
  files: ProjectFileDto[];
  selected: string | null;
  onSelect: (path: string) => void;
  onMutated: (m: FilesMutation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");

  async function call(url: string, init: RequestInit): Promise<{ ok?: boolean; error?: string; path?: string } | null> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; path?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    const data = await call(`/api/app/projects/${projectId}/files`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (data) onMutated({ type: "deleted", path });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span className="text-[13px] font-semibold">{files.length} files</span>
        <button
          type="button"
          className="chip ml-auto"
          onClick={() => setCreating((c) => !c)}
          aria-expanded={creating}
          disabled={busy}
        >
          New file
        </button>
      </div>
      {error && (
        <p role="alert" className="shrink-0 px-4 py-1 text-[12px]" style={{ color: "var(--accent)" }}>
          {error}
        </p>
      )}
      {creating && (
        <form
          className="flex shrink-0 gap-2 px-4 py-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = newPath.trim();
            if (!name) return;
            const data = await call(`/api/app/projects/${projectId}/files`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path: name, content: "" }),
            });
            if (data?.path) {
              onMutated({ type: "created", path: data.path, content: "" });
              setNewPath("");
              setCreating(false);
            }
          }}
        >
          <label htmlFor="new-file-path" className="sr-only">New file path</label>
          <input
            id="new-file-path"
            className="input min-w-0 flex-1 font-mono text-[13px]"
            placeholder="src/New.tsx"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !newPath.trim()}>
            Create
          </button>
        </form>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4" aria-label="Project files">
        {files.map((f) => (
          <li
            key={f.path}
            className="mono rounded-lg px-2.5 py-1.5 text-[12.5px]"
            style={
              selected === f.path
                ? { background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--accent)" }
                : { background: "var(--bg-inset)" }
            }
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:opacity-70"
                onClick={() => onSelect(f.path)}
                aria-label={`Open ${f.path} in the editor`}
              >
                {f.path}
              </button>
              <ExportButton projectId={projectId} label="ZIP" />
              <button
                type="button"
                className="rounded p-0.5 text-[11px] hover:opacity-70"
                style={{ color: "var(--ink-3)" }}
                aria-label={`Rename ${f.path}`}
                onClick={() => {
                  setRenaming(f.path);
                  setRenameTo(f.path);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-[11px] hover:opacity-70"
                style={{ color: "var(--accent)" }}
                aria-label={`Delete ${f.path}`}
                onClick={() => void remove(f.path)}
                disabled={busy}
              >
                Delete
              </button>
            </div>
            {renaming === f.path && (
              <form
                className="mt-1.5 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const to = renameTo.trim();
                  if (!to || to === f.path) {
                    setRenaming(null);
                    return;
                  }
                  const data = await call(`/api/app/projects/${projectId}/files`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ from: f.path, to }),
                  });
                  if (data?.path) {
                    onMutated({ type: "renamed", path: data.path, from: f.path });
                    setRenaming(null);
                  }
                }}
              >
                <label htmlFor={`rename-${f.path}`} className="sr-only">New path for {f.path}</label>
                <input
                  id={`rename-${f.path}`}
                  className="input min-w-0 flex-1 font-mono text-[12.5px]"
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
                  Move
                </button>
              </form>
            )}
          </li>
        ))}
        {files.length === 0 && (
          <li className="muted px-1 pt-10 text-center text-[13px]">No files yet.</li>
        )}
      </ul>
    </div>
  );
}
