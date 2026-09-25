"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { File, FileCode, ChevronDown, FolderOpen, Globe, Palette, Paperclip, PanelRightClose, PanelRightOpen, Plug, Send, X } from "lucide-react";
import FileEditor from "./editor";
import ModelPicker from "@/components/app/model-picker";
import PreviewPane from "./preview-pane";
import UiPresetsPanel from "./ui-presets-panel";
import IntegrationsPanel from "./integrations-panel";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import type { ModelReadiness } from "@/lib/readiness";

// Conversational agent panel: a real chat thread on the left (messages
// persisted as Prompt rows), workspace tools (Files/Editor/Preview/…) on the
// right. No interview questions, no placeholder composer — just a chat.

type RunMode = "build" | "plan" | "mission" | "skills";
const MODES: { id: RunMode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "plan", label: "Plan" },
  { id: "mission", label: "Mission" },
  { id: "skills", label: "Skills" },
];

type ToolTab = "files" | "editor" | "preview" | "presets" | "integrations";
const TOOL_TABS = [
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "editor", label: "Editor", icon: FileCode },
  { id: "preview", label: "Preview", icon: Globe },
  { id: "presets", label: "UI Presets", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
] satisfies { id: ToolTab; label: string; icon: typeof FolderOpen }[];

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  dataUrl?: string;
}

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

const COMPOSER_MAX_HEIGHT = 180;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function changeDiff(c: ChangeDto): string[] {
  const patch = createTwoFilesPatch(`a/${c.path}`, `b/${c.path}`, c.before, c.after, "", "", { context: 3 });
  return patch.split("\n").filter((l) => !l.startsWith("***") && !l.startsWith("==="));
}

function DiffLines({ c }: { c: ChangeDto }) {
  return (
    <pre className="mono mt-2 max-h-56 overflow-auto rounded-lg p-2 text-[12px] leading-[1.6]" style={{ background: "var(--terminal)" }}>
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
  initialMessages,
  initialNotice,
  initialPrompt,
  initialMode,
  initialModelId,
  readiness = [],
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
  const [files, setFiles] = useState<ProjectFileDto[]>(initialFiles);
  const [changes, setChanges] = useState<ChangeDto[]>(initialChanges); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [selected, setSelected] = useState<string>(initialFiles[0]?.path ?? "");
  const [content, setContent] = useState(initialFiles[0]?.content ?? "");
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(initialModelId || DEFAULT_MODEL_ID);
  const [mode, setMode] = useState<RunMode>(
    MODES.some((m) => m.id === initialMode) ? (initialMode as RunMode) : "build",
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [trace, setTrace] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState(initialNotice ?? "");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolTab, setToolTab] = useState<ToolTab>("preview");
  const autoSentRef = useRef(false);

  // When arriving from the home composer with ?prompt=, send it as the first
  // chat message automatically (once).
  useEffect(() => {
    if (initialPrompt && !autoSentRef.current && !busy) {
      autoSentRef.current = true;
      void send(undefined, initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, busy]);

  const filesByPath = useMemo(() => Object.fromEntries(files.map((f) => [f.path, f.content])), [files]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamStatus]);

  function autoresize() {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }

  async function attachFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added = await Promise.all(
      Array.from(list).map(async (f, i) => {
        const isImg = f.type.startsWith("image/");
        let url: string | undefined;
        let dataUrl: string | undefined;
        try {
          url = URL.createObjectURL(f);
          if (isImg && f.size <= 1_500_000) dataUrl = await readAsDataUrl(f).catch(() => undefined);
        } catch {
          url = undefined;
        }
        return {
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          type: f.type || "file",
          size: f.size,
          url: isImg ? url : undefined,
          dataUrl,
        };
      }),
    );
    setAttachments((prev) => [...prev, ...added]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  const applyResult = useCallback(
    (prompt: { changes: ChangeDto[] }, reply: string | undefined, modelLabel?: string) => {
      // Edits were already applied server-side; reflect them in the local files.
      const newChanges = prompt.changes.map((c) => ({ ...c, status: "applied" as const }));
      if (newChanges.length > 0) {
        setChanges((prev) => [...prev, ...newChanges]);
        setFiles((prev) =>
          prev.map((f) => {
            const c = newChanges.find((x) => x.path === f.path);
            return c ? { ...f, content: c.after } : f;
          }),
        );
        for (const c of newChanges) {
          if (!files.some((f) => f.path === c.path)) {
            setFiles((prev) => [...prev, { path: c.path, content: c.after }]);
          }
        }
      }
      const newMsg: ChatMessageDto = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: reply || (newChanges.length ? `Done — updated ${newChanges.map((c) => c.path).join(", ")}.` : "All set."),
        mode,
        modelLabel: modelLabel ?? "",
        error: "",
        createdAt: new Date().toISOString(),
        changes: newChanges,
      };
      setMessages((prev) => [...prev, newMsg]);
    },
    [mode, files],
  );

  async function send(e?: React.FormEvent, overrideText?: string) {
    e?.preventDefault();
    const text = (overrideText ?? prompt).trim();
    if (!text || busy) return;

    // Optimistic user message; the run streams status into the thread live.
    const userMsg: ChatMessageDto = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      mode,
      modelLabel: "",
      error: "",
      createdAt: new Date().toISOString(),
      changes: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setErrorNotice("");
    setBusy(true);
    setTrace([]);
    setStreamStatus(mode === "plan" ? "Planning…" : "Agent is working…");
    if (boxRef.current) {
      boxRef.current.style.height = "auto";
    }

    const payload = {
      prompt: text,
      modelId,
      mode,
      attachments: attachments.length
        ? attachments.map(({ name, type, size, dataUrl }) => ({ name, type, size, dataUrl }))
        : undefined,
    };

    try {
      const res = await fetch(`/api/app/projects/${projectId}/prompt/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      let lastReply: string | undefined;
      let done: { ok?: boolean; prompt?: { changes: ChangeDto[] }; reply?: string; modelLabel?: string; error?: string; notice?: string } | null = null;

      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim().split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const msg = JSON.parse(line.slice(6)) as {
                type: string;
                message?: string;
                error?: string;
                notice?: string;
                reply?: string;
                modelLabel?: string;
                prompt?: { changes: ChangeDto[] };
              };
              if (msg.type === "status" || msg.type === "heartbeat") {
                if (msg.message) {
                  setStreamStatus(msg.message);
                  // Real progress lines (Reading/Editing/Applying/wrote) stay
                  // in the thread as the agent's visible trail of work.
                  if (!msg.message.startsWith("Still generating")) {
                    const line = msg.message;
                    setTrace((prev) => (prev[prev.length - 1] === line ? prev : [...prev, line]));
                  }
                }
              } else if (msg.type === "error") {
                done = { ok: false, error: msg.error, notice: msg.notice };
              } else if (msg.type === "done") {
                done = msg;
                if (msg.reply) lastReply = msg.reply;
              }
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      } else {
        // Fallback: plain JSON (non-streaming route or error body).
        done = (await res.json().catch(() => null)) as typeof done;
      }

      if (done?.ok && done.prompt) {
        applyResult(done.prompt, done.reply ?? lastReply, done.modelLabel);
        setToolTab("preview");
      } else {
        const errText = done?.error ?? "The agent did not return changes.";
        setErrorNotice(errText);
        setMessages((prev) => [
          ...prev,
          {
            id: `local-err-${Date.now()}`,
            role: "assistant",
            content: `⚠ ${errText}${done?.notice ? ` — ${done.notice}` : ""}`,
            mode,
            modelLabel: "",
            error: errText,
            createdAt: new Date().toISOString(),
            changes: [],
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setErrorNotice(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-err-${Date.now()}`,
          role: "assistant",
          content: `⚠ ${msg}`,
          mode,
          modelLabel: "",
          error: msg,
          createdAt: new Date().toISOString(),
          changes: [],
        },
      ]);
    } finally {
      for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
      setAttachments([]);
      setBusy(false);
      setStreamStatus("");
      setTrace([]);
    }
  }

  async function act(change: ChangeDto, action: "apply" | "revert") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/app/projects/${projectId}/changes/${change.id}/${action}`, { method: "POST" });
      if (!res.ok) {
        setErrorNotice(`${action} failed.`);
        return;
      }
      const next = action === "apply" ? change.after : change.before;
      const statusValue = action === "apply" ? ("applied" as const) : ("reverted" as const);
      setChanges((prev) => prev.map((c) => (c.id === change.id ? { ...c, status: statusValue } : c)));
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          changes: m.changes.map((c) => (c.id === change.id ? { ...c, status: statusValue } : c)),
        })),
      );
      setFiles((prev) => prev.map((f) => (f.path === change.path ? { ...f, content: next } : f)));
      if (selected === change.path) setContent(next);
    } finally {
      setBusy(false);
    }
  }

  function pick(path: string) {
    setSelected(path);
    setContent(filesByPath[path] ?? "");
    setToolTab("editor");
  }

  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/app/projects/${projectId}/files/${encodeURIComponent(selected).replace(/%2F/g, "/")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setFiles((prev) => prev.map((f) => (f.path === selected ? { ...f, content } : f)));
      } else {
        setErrorNotice("Save failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handlePresetApplied(file: { path: string; content: string }) {
    setFiles((prev) => {
      const exists = prev.some((f) => f.path === file.path);
      return exists ? prev.map((f) => (f.path === file.path ? { ...f, content: file.content } : f)) : [...prev, file];
    });
    if (selected === file.path) setContent(file.content);
  }

  return (
    <div className="flex min-w-0 flex-1 min-h-0 max-h-full" style={{ alignItems: "flex-start" }}>
      {/* Chat thread */}
      <aside aria-label="Chat" className="card bg-[#00000020] flex min-w-0 min-h-0 h-full flex-1 flex-col overflow-hidden" style={ { maxHeight: "98vh" } }>
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-3 py-2"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <h2 className="text-[13px] font-semibold">Chat</h2>
          <button
            type="button"
            className="chip"
            aria-label={toolsOpen ? "Hide workspace panel" : "Show workspace panel"}
            aria-pressed={toolsOpen}
            title={toolsOpen ? "Hide the files / preview panel" : "Show the files / preview panel"}
            onClick={() => setToolsOpen((o) => !o)}
          >
            {toolsOpen ? <PanelRightClose size={14} aria-hidden="true" /> : <PanelRightOpen size={14} aria-hidden="true" />}
          </button>
        </div>
        {errorNotice && (
          <div className="mx-3 mt-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)", color: "var(--accent)" }} role="alert">
            {errorNotice}{" "}
            <button type="button" className="underline hover:opacity-70" onClick={() => setErrorNotice("")}>
              dismiss
            </button>
          </div>
        )}

        <div ref={threadRef} className="flex-1 min-h-0 space-y-3 p-4" style={{ maxHeight: "58vh", overflowY: "scroll" }} aria-live="polite">
          {messages.length === 0 && !busy && (
            <div className="px-1 pt-10 text-center">
              <p className="text-[14px] font-semibold">Talk to your agent.</p>
              <p className="muted mt-1 text-[13px]">
                Describe what you want built or changed. Proposed file changes appear here with a diff you can apply or revert.
              </p>
            </div>
          )}

          {messages.map((m) => (
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
                {m.modelLabel && (
                  <p className="mt-1 text-[11px]" style={{ color: m.role === "user" ? "inherit" : "var(--ink-3)", opacity: m.role === "user" ? 0.7 : 1 }}>
                    {m.modelLabel} · {m.mode}
                  </p>
                )}
                {m.changes.map((c) => (
                  <div key={c.id} className="mt-2 rounded-xl p-2.5" style={{ background: "var(--bg-raised)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono truncate text-[12.5px]">{c.status === "reverted" ? c.path : `✓ ${c.path}`}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => act(c, c.status === "reverted" ? "apply" : "revert")}
                        disabled={busy}
                      >
                        {c.status === "reverted" ? "Restore" : "Undo"}
                      </button>
                    </div>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[12px] hover:opacity-70" style={{ color: "var(--ink-3)" }}>
                        Diff
                      </summary>
                      <DiffLines c={c} />
                    </details>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start">
              <details className="max-w-[85%] group" style={{ cursor: "default" }}>
                <summary className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] list-none cursor-pointer" style={{ background: "var(--bg-inset)", color: "var(--ink-2)" }}>
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} aria-hidden="true" />
                  <span className="font-medium">Thinking</span>
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180 opacity-50" aria-hidden="true" />
                </summary>
                <div className="mt-2 ml-6 border-l pl-3" style={{ borderColor: "var(--hairline)" }}>
                  {trace.length > 0 ? (
                    <ul className="mono space-y-0.5 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
                      {trace.map((line, i) => (
                        <li key={i}>› {line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>Model is reasoning…</p>
                  )}
                  {streamStatus && streamStatus !== "Thinking" && (
                    <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--accent)" }}>{streamStatus}</p>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Composer anchored to the bottom */}
        <form onSubmit={send} className="shrink-0 p-3 pt-1">
          <div
            className="rounded-2xl p-3 transition-shadow focus-within:shadow-[0_0_0_1px_var(--accent)]"
            style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[11.5px]" style={{ borderColor: "var(--hairline)", background: "var(--bg-inset)" }}>
                    {a.url ? (
                      <img src={a.url} alt="" className="h-5 w-5 rounded object-cover" />
                    ) : (
                      <File size={12} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
                    )}
                    <span className="mono max-w-[140px] truncate">{a.name}</span>
                    <span className="shrink-0" style={{ color: "var(--ink-3)" }}>
                      {fmtSize(a.size)}
                    </span>
                    <button type="button" className="rounded p-0.5 hover:opacity-70" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(a.id)}>
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label htmlFor="chat-prompt" className="sr-only">
              Message the agent
            </label>
            <textarea
              id="chat-prompt"
              ref={boxRef}
              className="w-full resize-none bg-transparent px-1 py-1 font-[inherit] text-[15px] leading-relaxed outline-none"
              style={{ color: "var(--ink)", minHeight: "auto" }}
              placeholder={mode === "plan" ? "Ask for a plan…" : "Message the agent — Enter to send, Shift+Enter for a new line"}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                autoresize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={busy}
              rows={2}
            />

            <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
              <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-inset)" }} role="tablist" aria-label="Agent mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.id}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold"
                    style={mode === m.id ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--ink-2)" }}
                    onClick={() => setMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <ModelPicker value={modelId} onChange={setModelId} readiness={readiness} />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.txt,.md,.json,.csv,.svg,.zip,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => {
                  void attachFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button type="button" className="chip" aria-label="Attach files" title="Attach files" onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={14} aria-hidden="true" />
              </button>
              <button type="submit" className="btn btn-primary ml-auto flex h-9 w-9 items-center justify-center !p-0" disabled={busy || !prompt.trim()} aria-label="Send message">
                <Send size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </aside>

      {/* Tools: files / editor / preview / presets / integrations */}
      {toolsOpen && (
        <aside className="card flex shrink-0 min-h-0 max-h-full flex-col overflow-hidden" aria-label="Workspace" style={{ width: 420, minWidth: 0, maxWidth: 720, maxHeight: "100%" }}>
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5" style={{ borderColor: "var(--hairline)" }} role="tablist" aria-label="Workspace">
            {TOOL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={toolTab === t.id}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium"
                style={toolTab === t.id ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" } : { color: "var(--ink-2)", opacity: 0.75 }}
                onClick={() => setToolTab(t.id)}
              >
                <t.icon size={14} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>

          {toolTab === "files" ? (
            <div className="flex min-h-0 flex-1 flex-col" aria-label="Project files">
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--hairline)" }}>
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
                      style={f.path === selected ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" } : { color: "var(--ink-2)" }}
                    >
                      {f.path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : toolTab === "editor" ? (
            <div className="flex min-h-0 flex-1 flex-col" aria-label="Editor">
              <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid var(--hairline)" }}>
                <span className="mono truncate text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  {selected || "select a file"}
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!selected || busy}>
                  Save
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {selected ? <FileEditor path={selected} value={content} onChange={setContent} /> : <p className="muted p-4 text-sm">Select a file to edit it.</p>}
              </div>
            </div>
          ) : toolTab === "preview" ? (
            <PreviewPane files={filesByPath} />
          ) : toolTab === "presets" ? (
            <UiPresetsPanel projectId={projectId} onApplied={handlePresetApplied} />
          ) : (
            <IntegrationsPanel />
          )}
        </aside>
      )}
    </div>
  );
}
