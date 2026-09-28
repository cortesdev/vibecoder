"use client";

import { useState } from "react";

// Shared workspace pieces: DTOs plus the authenticated ZIP download used by
// the header, file rows, and successful agent runs. One module so panels and
// the shell never import each other in a cycle.

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

export interface ChatMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: string;
  modelLabel: string;
  error: string;
  createdAt: string;
  changes: ChangeDto[];
  providerLabel?: string;
  latencyMs?: number;
  tokens?: number;
  notice?: string;
  changedCount?: number;
  exportUrl?: string;
}

export function fmtLatency(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Authenticated ZIP download with loading/success/error states. */
export function ExportButton({ projectId, label = "Export ZIP" }: { projectId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  async function download() {
    if (state === "busy") return;
    setState("busy");
    setError("");
    try {
      const res = await fetch(`/api/app/projects/${projectId}/export`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; path?: string } | null;
        throw new Error(
          data?.path ? `Export failed: ${data.error} (${data.path})` : (data?.error ?? `Export failed (${res.status})`),
        );
      }
      const blob = await res.blob();
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "project.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="chip" onClick={() => void download()} disabled={state === "busy"}>
        {state === "busy" ? "Exporting…" : label}
      </button>
      {state === "error" && (
        <span role="alert" className="text-[12px]" style={{ color: "var(--accent)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

/** Post-run download line with the real changed-file count. */
export function RunDownloadLink({ projectId, changedCount }: { projectId: string; changedCount: number }) {
  return (
    <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
      Done — updated {changedCount}. <ExportButton projectId={projectId} label="Download ZIP" />
    </p>
  );
}
