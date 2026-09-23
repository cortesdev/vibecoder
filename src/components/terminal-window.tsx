// Session replay: the demo types itself. `beat` (ms) schedules when each line
// appears; the "Thinking…" hold is just the gap before beat 3640. `--i` is the
// line's index for the stagger; keyframes reveal each line without JS.
const lines: {
  prompt?: boolean;
  cmd?: boolean;
  text: string;
  dim?: boolean;
  beat: number;
}[] = [
  { prompt: true, cmd: true, text: "cd ~/projects/shop-api", beat: 0 },
  { prompt: true, cmd: true, text: "vibecoder", beat: 480 },
  { text: "", beat: 840 },
  { text: "◆ vibecoder · ~/projects/shop-api", dim: true, beat: 1040 },
  { text: "› add rate limiting to the checkout API", prompt: true, beat: 1240 },
  { text: "", beat: 1640 },
  { text: "✻ Thinking…", dim: true, beat: 1840 },
  { text: "✔ Read 34 files · mapped the API routes", dim: true, beat: 3640 },
  { text: "✔ Ran the test suite — 41 passed", dim: true, beat: 4040 },
  { text: "", beat: 4440 },
  { text: "● Checkout rate limiting", dim: false, beat: 4640 },
  { text: "  src/server/checkout.ts        +4 −2", dim: true, beat: 5040 },
  { text: "  src/server/rateLimit.ts      +22 −0 (new)", dim: true, beat: 5440 },
  { text: "", beat: 5840 },
  { text: "Done · 2 files changed · /undo to revert", dim: true, beat: 6040 },
];

export default function TerminalWindow() {
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
        <span className="mono ml-3 text-xs" style={{ color: "#6b6b74" }}>
          vibecoder — zsh
        </span>
      </div>
      <div className="mono replay px-5 py-4 text-[12.5px] leading-[1.75]">
        {lines.map((l, i) => (
          <p
            key={i}
            style={
              {
                color: l.dim ? "#6b6b74" : l.cmd ? "#e8483f" : "#d8d8de",
                whiteSpace: "pre-wrap",
                "--beat": `${l.beat}ms`,
                "--i": i,
              } as React.CSSProperties
            }
          >
            {l.prompt && <span style={{ color: "#30d158" }}>› </span>}
            {l.text}
          </p>
        ))}
        <p
          style={
            {
              color: "#d8d8de",
              "--beat": "6440ms",
              "--i": lines.length,
            } as React.CSSProperties
          }
        >
          <span style={{ color: "#30d158" }}>› </span>
          <span
            className="inline-block h-[14px] w-[7px] translate-y-[2px]"
            style={{ background: "#e8483f", animation: "blink 1.1s steps(1) infinite" }}
          />
        </p>
      </div>
      <style>{`
        @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes replay {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .replay p {
          opacity: 0;
          animation: replay 240ms var(--ease-out) both;
          animation-delay: var(--beat, 0ms);
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes blink { 0% { opacity: 1; } }
          .replay p { opacity: 1; animation: none; }
        }
      `}</style>
    </div>
  );
}
