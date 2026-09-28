"use client";

import { useMemo, useState } from "react";
import PreviewPane from "./preview-pane";
import type { ModelReadiness } from "@/lib/readiness";

// Clean-slate workspace shell (vaibcode-V2 rebuild). Layout only: a read-only
// chat thread on the left, empty workspace tabs on the right. No fetching, no
// agent calls, no editing — every behavior is re-added slice by slice.

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
}

const TABS = ["Files", "Editor", "Preview", "Presets", "Integrations"] as const;

/** Post-run download line. The chat rebuild renders this after every
 *  successful run with the real changed-file count; the link hits the same
 *  export route, so it downloads the same content as the other entries. */
export function RunDownloadLink({ projectId, changedCount }: { projectId: string; changedCount: number }) {
  return (
    <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
      Done — updated {changedCount}. <ExportButton projectId={projectId} label="Download ZIP" />
    </p>
  );
}
/** Authenticated ZIP download with loading/success/error states. Used by the
 *  workspace header, file rows, and successful agent runs — all three hit the
 *  same export route, so all three download the same content. */
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

export default function ProjectBuilder({
  projectId,
  initialFiles,
  initialMessages,
  initialNotice,
}: {
  projectId: string;
  initialFiles: ProjectFileDto[];
  initialChanges: ChangeDto[];
  initialMessages: ChatMessageDto[];
  initialNotice?: string;
  initialPrompt?: string;
  initialMode?: string;
  initialModelId?: string;
  readiness?: ModelReadiness[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Preview");
  const files = useMemo(
    () => Object.fromEntries(initialFiles.map((f) => [f.path, f.content])),
    [initialFiles],
  );

  return (
    <div className="flex min-w-0 flex-1 min-h-0 max-h-full" style={{ alignItems: "flex-start" }}>
      <aside aria-label="Chat" className="card bg-[#00000020] flex min-w-0 min-h-0 h-full flex-1 flex-col overflow-hidden" style={{ maxHeight: "97vh" }}>
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-3 py-2"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <h2 className="text-[13px] font-semibold">Chat</h2>
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            rebuilding
          </span>
        </div>
        {initialNotice && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)", color: "var(--accent)" }} role="status">
            {initialNotice}
          </div>
        )}
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {initialMessages.length === 0 && (
            <div className="px-1 pt-10 text-center">
              <p className="text-[14px] font-semibold">Talk to your agent.</p>
              <p className="muted mt-1 text-[13px]">The composer is being rebuilt — history below is read-only.</p>
            </div>
          )}
          {initialMessages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "var(--bg)", color: "var(--ink)" }
                    : { background: "var(--bg-inset)", color: "var(--ink)", boxShadow: "inset 0 0 0 1px var(--hairline)" }
                }
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <form className="shrink-0 p-3 pt-1" onSubmit={(e) => e.preventDefault()}>
          <div
            className="rounded-2xl p-3"
            style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            <label htmlFor="chat-prompt-stub" className="sr-only">Message the agent</label>
            <textarea
              id="chat-prompt-stub"
              className="w-full resize-none bg-transparent px-1 py-1 text-[15px] outline-none"
              style={{ color: "var(--ink)" }}
              placeholder="Composer returning soon…"
              rows={2}
              disabled
            />
          </div>
        </form>
      </aside>

      <section aria-label="Workspace" className="hidden min-h-0 flex-1 flex-col md:flex" style={{ maxHeight: "97vh" }}>
        <div className="flex shrink-0 items-center gap-1 px-3 py-2" role="tablist" aria-label="Workspace panels">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className="chip"
            >
              {t}
            </button>
          ))}
          <span className="ml-auto">
            <ExportButton projectId={projectId} />
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col" data-testid={`panel-${projectId}-${tab}`}>
          {tab === "Preview" ? (
            <PreviewPane files={files} />
          ) : tab === "Files" ? (
            <ul className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Project files">
              {initialFiles.map((f) => (
                <li
                  key={f.path}
                  className="mono flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]"
                  style={{ background: "var(--bg-inset)" }}
                >
                  <span className="truncate">{f.path}</span>
                  <ExportButton projectId={projectId} label="ZIP" />
                </li>
              ))}
              {initialFiles.length === 0 && (
                <li className="muted px-1 pt-10 text-center text-[13px]">No files yet.</li>
              )}
            </ul>
          ) : (
            <div className="flex-1 p-4">
              <div className="px-1 pt-10 text-center">
                <p className="text-[14px] font-semibold">{tab}</p>
                <p className="muted mt-1 text-[13px]">This panel is being rebuilt from scratch.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
