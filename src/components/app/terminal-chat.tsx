"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live landing chat. Same chrome as the replay TerminalWindow, but the input is
 * real: type a prompt and hit return — VibeCoder answers you directly, skipping
 * the narrowing interview because there's nothing to narrow. Your prompt ships
 * to /agent?prompt=…, which prefills the real composer there.
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
    <div className="overflow-hidden rounded-lg text-left shadow-2xl" style={{ background: "var(--terminal)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 24px 60px rgba(0,0,0,0.5)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
        <span className="mono ml-3 text-[12px]" style={{ color: "#6b6b74" }}>
          vibecoder — zsh
        </span>
      </div>
      <div className="mono px-5 py-4 text-[12.5px] leading-[1.75]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          autoFocus
          disabled={busy}
          placeholder="Describe what you want to build…"
          aria-label="What do you want to build?"
          className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-[12.5px] text-[#e8e8ee] outline-none placeholder:text-[#6b6b74] focus:border-[#30d158]/60"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "#6b6b74" }}>
            Enter to build it — no questions
          </span>
          <button
            type="button"
            onClick={send}
            disabled={busy || !text.trim()}
            className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "#30d15822", color: "#30d158" }}
          >
            {busy ? "Routing…" : "Ask →"}
          </button>
        </div>
      </div>
    </div>
  );
}
