"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PreviewPane from "./preview-pane";
import PresetPanel from "./preset-panel";
import FilesPanel, { type FilesMutation } from "./files-panel";
import EditorPanel from "./editor-panel";
import ChatMessages from "./chat-messages";
import IntegrationsPanel from "./integrations-panel";
import type { IntegrationService } from "@/lib/integrations";
import AttachmentPicker, { type PickedFile } from "./attachment-picker";
import ModelPicker, { useLiveReadiness } from "@/components/app/model-picker";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { downscaleImage } from "@/lib/attachments/client";
import { effectiveStatement, resolveEffectiveModel } from "@/lib/model-selection";
import type { ModelReadiness } from "@/lib/readiness";

// Rebuilding workspace (vaibcode-V2). Chat sends text + attachments as
// multipart to the agent route; workspace tabs host the rebuilt panels.
// Shared DTOs and download UI live in workspace-shared.tsx (imported by the
// panels too). Re-exported here so existing importers keep compiling.
import type { ProjectFileDto, ChangeDto, ChatMessageDto } from "./workspace-shared";
import { ExportButton, RunDownloadLink, fmtLatency } from "./workspace-shared";
export type { ProjectFileDto, ChangeDto, ChatMessageDto };
export { ExportButton, RunDownloadLink, fmtLatency };

const TABS = ["Files", "Editor", "Preview", "Presets", "Integrations"] as const;

export default function ProjectBuilder({
  projectId,
  initialFiles,
  initialMessages,
  initialNotice,
  initialPrompt,
  initialModelId,
  initialPresetId = null,
  readiness = [],
  integrations = [],
  integrationCounts = {},
}: {
  projectId: string;
  initialFiles: ProjectFileDto[];
  initialChanges: ChangeDto[];
  initialMessages: ChatMessageDto[];
  initialNotice?: string;
  initialPrompt?: string;
  initialMode?: string;
  initialModelId?: string;
  initialPresetId?: string | null;
  readiness?: ModelReadiness[];
  integrations?: IntegrationService[];
  integrationCounts?: Record<string, number>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Preview");
  // Workspace store: one source of truth for files, selection, unsaved
  // drafts, and diagnostics. `saved` mirrors the server; `dirty` holds
  // unsaved editor text per path and survives tab switches and refreshes.
  const [saved, setSaved] = useState<ProjectFileDto[]>(initialFiles);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics] = useState<Record<string, { message: string }[]>>({});
  const [mobileView, setMobileView] = useState<"chat" | "work">("chat");

  // Merge server truth without clobbering unsaved drafts. Server wins for
  // every path; entries survive locally only while they carry a dirty draft
  // (a refresh racing an in-flight keystroke must not eat typed text).
  useEffect(() => {
    setSaved((prev) => {
      const next = new Map(initialFiles.map((f) => [f.path, f.content]));
      const merged = new Map<string, string>();
      for (const [path, content] of next) merged.set(path, content);
      for (const f of prev) {
        if (!merged.has(f.path) && dirty[f.path] !== undefined) merged.set(f.path, f.content);
      }
      if (merged.size === prev.length && [...merged].every(([p, c]) => prev.some((f) => f.path === p && f.content === c))) {
        return prev;
      }
      return [...merged].map(([path, content]) => ({ path, content }));
    });
  }, [initialFiles, dirty]);

  const filesRecord = useMemo(() => Object.fromEntries(saved.map((f) => [f.path, f.content])), [saved]);
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  // A `?prompt=` deep link pre-fills the composer so the first request is never
  // silently dropped; the user still presses send.
  const [text, setText] = useState(initialPrompt ?? "");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [modelId, setModelId] = useState(
    initialModelId && initialModelId.trim() ? initialModelId : DEFAULT_MODEL_ID,
  );
  // One live readiness snapshot for the picker and the send row, so both agree
  // on which model will actually run and neither substitutes silently.
  const { readiness: liveReadiness, secondsLeft } = useLiveReadiness(readiness);
  const effectiveNote = effectiveStatement(resolveEffectiveModel(modelId, liveReadiness));
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const router = useRouter();

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const message = text.trim();
    const valid = picked.filter((p) => !p.error);
    if ((!message && valid.length === 0) || busy) return;
    setBusy(true);
    setSendError("");
    // Optimistic user turn; typed text is only cleared once the server answers.
    const userMsg: ChatMessageDto = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: message || valid.map((p) => p.file.name).join(", "),
      mode: "build",
      modelLabel: "",
      error: "",
      createdAt: new Date().toISOString(),
      changes: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const form = new FormData();
      form.set("message", message);
      if (modelId) form.set("modelId", modelId);
      for (const p of valid) {
        let blob: Blob = p.file;
        if (p.file.type === "image/png" || p.file.type === "image/jpeg" || p.file.type === "image/webp") {
          try {
            blob = (await downscaleImage(p.file)).blob;
          } catch {
            // No browser imaging here — ship the original, server validates.
          }
        }
        form.append("attachments", blob, p.file.name);
      }
      const res = await fetch(`/api/app/projects/${projectId}/agent`, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        reply?: string;
        modelId?: string;
        modelLabel?: string;
        providerLabel?: string;
        latencyMs?: number;
        usage?: { totalTokens?: number };
        notice?: string;
        changedPaths?: string[];
        validation?: { ok: boolean; errors: { path?: string; message: string }[]; repaired?: boolean };
      } | null;
      if (!res.ok || !data?.ok) {
        const detail = data && "error" in data && typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
        throw new Error(detail);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply || "Done.",
          mode: "build",
          modelLabel: data.modelLabel ?? "",
          providerLabel: data.providerLabel,
          latencyMs: data.latencyMs,
          tokens: data.usage?.totalTokens,
          notice: data.notice,
          changedCount: Array.isArray(data.changedPaths) ? data.changedPaths.length : undefined,
          error: "",
          createdAt: new Date().toISOString(),
          changes: [],
        },
      ]);
      setText("");
      setPicked([]);
      applyValidation(data.validation);
      router.refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed — your text is intact.");
      setDiagnostics({});
    } finally {
      setBusy(false);
    }
  }

  // Validation runs server-side on the edited tree. Surface its diagnostics in
  // the Editor, per file. A turn that failed rolled its files back, so any
  // diagnostics from earlier edits are cleared rather than left pointing at
  // code that no longer exists.
  function applyValidation(validation?: { ok: boolean; errors: { path?: string; message: string }[] }) {
    if (!validation) return;
    setDiagnostics((prev) => {
      const next = { ...prev };
      if (validation.ok) return next;
      for (const error of validation.errors) {
        if (error.path) {
          const list = next[error.path] ?? [];
          if (!list.some((d) => d.message === error.message)) next[error.path] = [...list, { message: error.message }];
        }
      }
      return next;
    });
  }

  // A successful mutation refreshes every affected view at once: the file
  // list, the preview bundle, and the open editor baseline — without losing
  // unsaved drafts on other paths. The refresh re-reads server truth so the
  // merge effect below can never resurrect a deleted file from stale props.
  function applyMutation(m: FilesMutation) {
    if (m.type === "created") {
      setSaved((prev) => (prev.some((f) => f.path === m.path) ? prev : [...prev, { path: m.path, content: m.content ?? "" }]));
      setSelected(m.path);
      setTab("Editor");
    } else if (m.type === "renamed" && m.from) {
      setSaved((prev) =>
        prev.map((f) => (f.path === m.from ? { path: m.path, content: f.content } : f)),
      );
      setDirty((prev) => {
        if (m.from === undefined || prev[m.from] === undefined) return prev;
        const { [m.from]: text, ...rest } = prev;
        return { ...rest, [m.path]: text };
      });
      setSelected((s) => (s === m.from ? m.path : s));
    } else if (m.type === "deleted") {
      setSaved((prev) => prev.filter((f) => f.path !== m.path));
      setDirty((prev) => {
        if (prev[m.path] === undefined) return prev;
        const { [m.path]: _drop, ...rest } = prev;
        return rest;
      });
      setSelected((s) => (s === m.path ? null : s));
    }
    router.refresh();
  }

  const selectedContent = selected ? (saved.find((f) => f.path === selected)?.content ?? "") : "";

  return (
    <div className="flex min-w-0 flex-1 min-h-0 max-h-full flex-col md:flex-row" style={{ alignItems: "flex-start" }}>
      {/* Mobile view switch — the workspace is never hidden, only switched. */}
      <div className="flex w-full shrink-0 gap-1 px-1 pb-2 md:hidden" role="tablist" aria-label="Chat or workspace">
        {(["chat", "work"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={mobileView === v}
            onClick={() => setMobileView(v)}
            className="chip flex-1"
          >
            {v === "chat" ? "Chat" : "Workspace"}
          </button>
        ))}
      </div>
      <aside
        aria-label="Chat"
        className={`card bg-[#00000020] min-w-0 min-h-0 h-full flex-1 flex-col overflow-hidden ${mobileView === "chat" ? "flex" : "hidden"} md:flex`}
        style={{ maxHeight: "97vh" }}
      >
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
        <ChatMessages projectId={projectId} messages={messages} busy={busy} />
        <form className="shrink-0 p-3 pt-1" onSubmit={(e) => void send(e)}>
          <div
            className="rounded-2xl p-3"
            style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            <AttachmentPicker value={picked} onChange={setPicked} />
            <label htmlFor="chat-prompt" className="sr-only">Message the agent</label>
            <textarea
              id="chat-prompt"
              className="mt-1 w-full resize-none bg-transparent px-1 py-1 text-[15px] outline-none"
              style={{ color: "var(--ink)" }}
              placeholder="Message the agent — Enter to send, Shift+Enter for a new line"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={busy}
            />
            <div className="mt-1 flex items-center gap-2 px-1">
              <ModelPicker
                value={modelId}
                onChange={setModelId}
                readiness={liveReadiness}
                secondsLeft={secondsLeft}
              />
              <button type="submit" className="btn btn-primary btn-sm ml-auto" disabled={busy || (!text.trim() && picked.filter((p) => !p.error).length === 0)}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
            {effectiveNote && (
              <p
                className="mt-1 px-1 text-[11.5px]"
                style={{ color: "var(--warn)" }}
                data-testid="effective-model"
                aria-live="polite"
              >
                {effectiveNote}
              </p>
            )}
            {sendError && (
              <p role="alert" className="mt-1 px-1 text-[13px]" style={{ color: "var(--accent)" }}>
                {sendError}
              </p>
            )}
          </div>
        </form>
      </aside>

      <section
        aria-label="Workspace"
        className={`min-h-0 flex-1 flex-col ${mobileView === "work" ? "flex" : "hidden"} md:flex`}
        style={{ maxHeight: "97vh" }}
      >
        <div className="flex shrink-0 items-center gap-1 px-3 py-2">
          <div className="flex items-center gap-1" role="tablist" aria-label="Workspace panels">
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
          </div>
          <span className="ml-auto">
            <ExportButton projectId={projectId} />
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col" data-testid={`panel-${projectId}-${tab}`}>
          {tab === "Preview" ? (
            <PreviewPane files={filesRecord} projectId={projectId} />
          ) : tab === "Presets" ? (
            <PresetPanel projectId={projectId} activePresetId={initialPresetId} onChanged={() => router.refresh()} />
          ) : tab === "Files" ? (
            <FilesPanel
              projectId={projectId}
              files={saved}
              selected={selected}
              onSelect={(path) => {
                setSelected(path);
                setTab("Editor");
              }}
              onMutated={applyMutation}
            />
          ) : tab === "Integrations" ? (
            <IntegrationsPanel
              key="integrations"
              projectId={projectId}
              services={integrations}
              initialCounts={integrationCounts}
            />
          ) : tab === "Editor" ? (
            <EditorPanel
              key={selected ?? "none"}              projectId={projectId}
              path={selected}
              savedContent={selectedContent}
              draft={selected ? dirty[selected] : undefined}
              onDraft={(path, text) => setDirty((prev) => ({ ...prev, [path]: text }))}
              onSaved={(path, content) => {
                setSaved((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
                setDirty((prev) => {
                  if (prev[path] === undefined) return prev;
                  const { [path]: _drop, ...rest } = prev;
                  return rest;
                });
                // A manual save supersedes the previous build diagnostics.
                setDiagnostics((prev) => {
                  if (!prev[path]) return prev;
                  const { [path]: _drop, ...rest } = prev;
                  return rest;
                });
                router.refresh();
              }}
              diagnostics={selected ? (diagnostics[selected] ?? []) : []}
            />
          ) : (
            <div className="flex-1 p-4">
              <div className="px-1 pt-10 text-center">
                <p className="text-[14px] font-semibold">{tab}</p>
                <p className="muted mt-1 text-[13px]">Integrations arrive in the next slice.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
