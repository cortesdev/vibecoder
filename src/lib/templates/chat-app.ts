import { baseFiles, indexCss, type ThemeVars } from "./shared";

export const CHAT_THEME: ThemeVars = {
  bg: "#0a0a12",
  surface: "#131322",
  ink: "#e6e6f2",
  accent: "#2dd4bf",
  radius: 18,
  font: "system-ui, -apple-system, sans-serif",
};

const APP_TSX =
  'import { useRef, useState } from "react";\n' +
  "\n" +
  "interface Msg { id: number; from: 'user' | 'bot'; text: string; }\n" +
  "\n" +
  "const REPLY: Record<string, string> = {\n" +
  '  hello: "Hello! Ask me about shipping, pricing, or hours.",\n' +
  '  pricing: "Starter is free, Studio is 49$/mo. No card required.",\n' +
  '  hours: "We answer on weekdays, 9-17 UTC.",\n' +
  "};\n" +
  "\n" +
  "function answerFor(text: string): string {\n" +
  "  const key = Object.keys(REPLY).find((k) => text.toLowerCase().includes(k));\n" +
  '  return key ? REPLY[key] : "Noted — a human will follow up shortly.";\n' +
  "}\n" +
  "\n" +
  "export default function App() {\n" +
  "  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'bot', text: 'Hi! How can I help?' }]);\n" +
  '  const [draft, setDraft] = useState("");\n' +
  "  const next = useRef(1);\n" +
  "  function send(e: { preventDefault: () => void }) {\n" +
  "    e.preventDefault();\n" +
  "    const text = draft.trim();\n" +
  "    if (!text) return;\n" +
  "    const mine: Msg = { id: next.current++, from: 'user', text };\n" +
  "    const reply: Msg = { id: next.current++, from: 'bot', text: answerFor(text) };\n" +
  "    setMsgs((m) => [...m, mine, reply]);\n" +
  '    setDraft("");\n' +
  "  }\n" +
  "  return (\n" +
  "    <main>\n" +
  "      <h1>Support chat</h1>\n" +
  '      <section className="card" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>\n' +
  "        {msgs.map((m) => (\n" +
  '          <p key={m.id} style={{ alignSelf: m.from === \'user\' ? \'flex-end\' : \'flex-start\', background: m.from === \'user\' ? \'var(--accent)\' : \'var(--bg)\', color: m.from === \'user\' ? \'#04211d\' : \'var(--ink)\', borderRadius: \'var(--radius)\', padding: \'8px 12px\', maxWidth: \'80%\', margin: 0 }}>\n' +
  "            {m.text}\n" +
  "          </p>\n" +
  "        ))}\n" +
  "      </section>\n" +
  '      <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 12 }}>\n' +
  '        <label htmlFor="chatbox" className="sr-only">Message</label>\n' +
  '        <input id="chatbox" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Try hello, pricing, hours…" style={{ flex: 1 }} />\n' +
  '        <button type="submit">Send</button>\n' +
  "      </form>\n" +
  "    </main>\n" +
  "  );\n" +
  "}\n";

export function files(name: string): Record<string, string> {
  return baseFiles(name, APP_TSX, indexCss(CHAT_THEME));
}
