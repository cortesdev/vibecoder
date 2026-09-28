"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatMessages from "@/components/projects/chat-messages";
import AttachmentPicker, { type PickedFile } from "@/components/projects/attachment-picker";
import ModelPicker from "@/components/app/model-picker";
import { downscaleImage } from "@/lib/attachments/client";
import { nameFromPrompt } from "@/lib/chat/naming";
import { forgetThread, rememberThread, threadTarget } from "@/lib/chat/thread";
import { CHAT_TEMPLATE_ID } from "@/lib/templates/catalog";
import type { ModelReadiness } from "@/lib/readiness";
import type { ChatMessageDto } from "@/components/projects/workspace-shared";

// Chat-first home. The thread is the product; a project is the storage
// detail behind it. The first message opens a thread, every later message
// continues THAT thread, and the user never gets navigated off the page.

export default function ChatHome({
  initialThread,
  initialMessages,
  readiness,
  initialModelId,
  initialNotice,
}: {
  initialThread: { id: string; name: string } | null;
  initialMessages: ChatMessageDto[];
  readiness: ModelReadiness[];
  initialModelId?: string;
  initialNotice?: string;
}) {
  const router = useRouter();
  const [threadId, setThreadId] = useState(initialThread?.id ?? null);
  const [threadName, setThreadName] = useState(initialThread?.name ?? "");
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [modelId, setModelId] = useState(initialModelId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  function newThread() {
    forgetThread(window.localStorage);
    setThreadId(null);
    setThreadName("");
    setMessages([]);
    setText("");
    setError("");
  }

  async function openThread() {
    // Reuse the active thread. Only a genuinely new thread creates a project,
    // so a conversation accumulates instead of scattering across projects.
    let id = threadTarget(threadId).projectId;
    if (!id) {
      const created = await fetch("/api/app/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(text), templateId: CHAT_TEMPLATE_ID }),
      });
      const data = (await created.json().catch(() => null)) as { ok?: boolean; project?: { id: string }; error?: string } | null;
      if (!created.ok || !data?.ok || !data.project) throw new Error(data?.error ?? "Could not start the thread.");
      id = data.project.id;
      setThreadId(id);
      setThreadName(nameFromPrompt(text));
      rememberThread(window.localStorage, id);
    }

    const form = new FormData();
    form.set("message", text);
    if (modelId) form.set("modelId", modelId);
    for (const p of picked.filter((a) => !a.error)) {
      let blob: Blob = p.file;
      if (p.file.type === "image/png" || p.file.type === "image/jpeg" || p.file.type === "image/webp") {
        try {
          blob = (await downscaleImage(p.file)).blob;
        } catch {
          // Ship the original; the server validates authoritatively.
        }
      }
      form.append("attachments", blob, p.file.name);
    }

    const message = text;
    const turned = await fetch(`/api/app/projects/${id}/agent`, { method: "POST", body: form });
    const data = (await turned.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      reply?: string;
      modelLabel?: string;
      providerLabel?: string;
      latencyMs?: number;
      usage?: { totalTokens?: number };
      notice?: string;
      changedPaths?: string[];
    } | null;
    if (!turned.ok || !data?.ok) {
      throw new Error(data?.error ?? `Request failed (${turned.status})`);
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `local-user-${prev.length}`,
        role: "user",
        content: message,
        mode: "build",
        modelLabel: "",
        error: "",
        createdAt: new Date().toISOString(),
        changes: [],
      },
      {
        id: `local-assistant-${prev.length}`,
        role: "assistant",
        content: data?.reply ?? "Done.",
        mode: "build",
        modelLabel: data?.modelLabel ?? "",
        providerLabel: data?.providerLabel,
        latencyMs: data?.latencyMs,
        tokens: data?.usage?.totalTokens,
        notice: data?.notice,
        changedCount: Array.isArray(data?.changedPaths) ? data.changedPaths.length : undefined,
        error: "",
        createdAt: new Date().toISOString(),
        changes: [],
      },
    ]);
    setText("");
    setPicked([]);
    return id;
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await openThread();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed — your text is intact.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
          {threadName || "New chat"}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <ModelPicker value={modelId} onChange={setModelId} readiness={readiness} />
          {threadId && (
            <button
              type="button"
              className="muted rounded-md px-2.5 py-1 text-[12px]"
              style={{ border: "1px solid var(--line)" }}
              onClick={newThread}
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {initialNotice && (
        <div className="mx-4 mb-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--bg-inset)", color: "var(--accent)" }} role="status">
          {initialNotice}
        </div>
      )}

      <ChatMessages
        projectId={threadId ?? ""}
        messages={messages}
        busy={busy}
        emptyState={
          <div className="px-1 pt-16 text-center">
            <p className="text-[15px] font-semibold">Ask for anything.</p>
            <p className="muted mt-1 text-[13px]">
              A question, a screenshot to match, or a whole app. Files appear when the work needs them.
            </p>
          </div>
        }
      />
      <div ref={bottom} />

      {threadId && (
        <div className="mx-auto w-full max-w-[720px] px-4 pb-1">
          <a className="muted text-[12px] underline" href={`/agent/projects/${threadId}`}>
            Open this thread&rsquo;s files, preview and export →
          </a>
        </div>
      )}

      <form className="mx-auto w-full max-w-[720px] shrink-0 p-4 pt-1" onSubmit={(e) => void send(e)}>
        {error && (
          <p role="alert" className="mb-2 text-[13px]" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        )}
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
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="muted text-[11px]">Enter to send</span>
            <button
              type="submit"
              className="rounded-md px-3.5 py-1.5 text-[13px] font-medium"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
              disabled={busy || !text.trim()}
            >
              {busy ? "Working…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
