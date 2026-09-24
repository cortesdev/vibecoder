"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live landing chat. Same chrome as the replay TerminalWindow (traffic lights,
 * "vibecoder — zsh" bar, mono prompt), except the input is real: type a prompt
 * and hit return — VibeCoder answers you directly, no narrowing interview. Your
 * prompt ships to /agent?prompt=…, which prefills the composer there so the run
 * starts immediately on existing keys (Groq free + Gemini fallback).
 */
export default function TerminalChat() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    router.push(`/agent?prompt=${encodeURIComponent(t)}`);
  }

  return (
    <div
      className="overflow-hidden rounded-xl text-left shadow-2xl"
      style={{
        background: "var(--terminal)",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.5)",
      }}
      aria-hidden="true"
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
        <span className="mono px-3 text-xs" style={{ color: "#6b6b74" }}>
          vibecoder — zsh
        </span>
      </div>

      <div className="mono px-5 py-4 text-[12.5px] leading-[1.75]">
        <textarea
          id="terminal-chat-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          autoFocus
          disabled={busy}
          placeholder="Describe what to build — a landing page, a game, a dashboard…"
          aria-label="What do you want to build?"
          className="w-full resize-none bg-transparent outline-none placeholder:text-[#6b6b74]"
        />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "#6b6b74" }}>
            Enter to answer directly — no questions
          </span>
          <button
            type="button"
            onClick={send}
            disabled={busy || !text.trim()}
            className="mono rounded-lg px-4 py-2 text-[12px] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            {busy ? "Preparing…" : "Ask →"}
          </button>
        </div>
      </div>
    </div>
  );
}
