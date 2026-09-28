"use client";

import { useId, useRef, useState } from "react";
import { File, Paperclip, X } from "lucide-react";
import { precheckFile } from "@/lib/attachments/client";

export interface PickedFile {
  id: string;
  file: File;
  url?: string;
  error?: string;
}

// Attachment input: file dialog, paste, and drag/drop. Thumbnails for images,
// badges for documents, per-file remove. Validation feedback is immediate and
// local — rejected files never leave the browser, typed text lives upstream.
export default function AttachmentPicker({
  value,
  onChange,
}: {
  value: PickedFile[];
  onChange: (next: PickedFile[]) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");

  function add(incoming: File[]) {
    if (incoming.length === 0) return;
    const next = [...value];
    let rejected = 0;
    for (const file of incoming) {
      const check = precheckFile({ name: file.name, type: file.type, size: file.size });
      if (!check.ok) {
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, error: check.message });
        rejected += 1;
        continue;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }
    onChange(next);
    setStatus(rejected > 0 ? `${rejected} file${rejected === 1 ? "" : "s"} rejected — see details.` : "");
  }

  function remove(id: string) {
    const target = value.find((v) => v.id === id);
    if (target?.url) URL.revokeObjectURL(target.url);
    onChange(value.filter((v) => v.id !== id));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(Array.from(e.dataTransfer.files ?? []));
      }}
      onPaste={(e) => add(Array.from(e.clipboardData.files ?? []))}
      className="rounded-xl"
      style={dragging ? { outline: "2px dashed var(--accent)", outlineOffset: 2 } : undefined}
    >
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-live="polite">
          {value.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[11.5px]"
              style={{ borderColor: a.error ? "var(--accent)" : "var(--hairline)", background: "var(--bg-inset)" }}
            >
              {a.url ? (
                <img src={a.url} alt="" className="h-5 w-5 rounded object-cover" />
              ) : (
                <File size={12} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
              )}
              <span className="mono max-w-[140px] truncate" title={a.error ?? a.file.name}>
                {a.file.name}
              </span>
              <button
                type="button"
                className="rounded p-0.5 hover:opacity-70"
                aria-label={`Remove ${a.file.name}`}
                onClick={() => remove(a.id)}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      {value.some((a) => a.error) && (
        <ul className="mb-2 space-y-0.5" aria-live="polite">
          {value
            .filter((a) => a.error)
            .map((a) => (
              <li key={a.id} role="alert" className="text-[12px]" style={{ color: "var(--accent)" }}>
                {a.error}
              </li>
            ))}
        </ul>
      )}
      {status && !value.some((a) => a.error) && (
        <p className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }} aria-live="polite">
          {status}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        id={inputId}
        accept="image/*,video/mp4,video/webm,.pdf,.txt,.md,.json,.csv,.svg"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button type="button" className="chip" aria-label="Attach files" title="Attach files" onClick={() => inputRef.current?.click()}>
        <Paperclip size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
