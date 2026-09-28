"use client";

import { RunDownloadLink, fmtLatency, type ChatMessageDto } from "./workspace-shared";

// Shared chat transcript. Rendered by the project workspace and by the
// chat-first home view, so a thread looks and reads identically in both.
// Each assistant turn shows the model that actually ran, so a fallback or
// substitution is never invisible.

export default function ChatMessages({
  projectId,
  messages,
  busy,
  emptyState,
}: {
  projectId: string;
  messages: ChatMessageDto[];
  busy?: boolean;
  emptyState?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4" aria-live="polite">
      {messages.length === 0 && !busy && (
        <div className="px-1 pt-10 text-center">
          {emptyState ?? (
            <>
              <p className="text-[14px] font-semibold">Talk to your agent.</p>
              <p className="muted mt-1 text-[13px]">
                Attach a screenshot, clip, or document — the request carries it to the model.
              </p>
            </>
          )}
        </div>
      )}
      {messages.map((m) => {
        const latency = fmtLatency(m.latencyMs);
        const meta = [m.modelLabel, m.providerLabel, latency, m.tokens !== undefined ? `${m.tokens} tok` : null]
          .filter(Boolean)
          .join(" · ");
        return (
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
              {meta && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                  routed via {meta}
                </p>
              )}
              {m.notice && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--warn)" }}>
                  {m.notice}
                </p>
              )}
              {m.changedCount !== undefined && m.changedCount > 0 && (
                <RunDownloadLink projectId={projectId} changedCount={m.changedCount} />
              )}
            </div>
          </div>
        );
      })}
      {busy && (
        <div className="flex justify-start">
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }} aria-live="polite">
            Working…
          </p>
        </div>
      )}
    </div>
  );
}
