import { baseFiles, indexCss, jsString, type ThemeVars } from "./shared";

export const LANDING_THEME: ThemeVars = {
  bg: "#0b0e14",
  surface: "#141821",
  ink: "#e8ecf4",
  accent: "#5b8cff",
  radius: 14,
  font: "system-ui, -apple-system, sans-serif",
};

function appTsx(name: string): string {
  const brand = jsString(name.trim() || "My App");
  return (
    'import { useState } from "react";\n' +
    "\n" +
    "const FEATURES = [\n" +
    '  { title: "Fast by default", text: "A tiny bundle with no wasted requests." },\n' +
    '  { title: "Accessible", text: "Semantic landmarks, focus states, real buttons." },\n' +
    '  { title: "Yours to keep", text: "Plain React you can eject and deploy anywhere." },\n' +
    "];\n" +
    "\n" +
    "export default function App() {\n" +
    '  const [dark, setDark] = useState(true);\n' +
    '  const [email, setEmail] = useState("");\n' +
    '  const [signed, setSigned] = useState(false);\n' +
    "  return (\n" +
    "    <main>\n" +
    '      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>\n' +
    "        <strong>" + brand + "</strong>\n" +
    '        <button type="button" className="secondary" onClick={() => setDark(!dark)}>\n' +
    "          {dark ? \"Light mode\" : \"Dark mode\"}\n" +
    "        </button>\n" +
    "      </header>\n" +
    '      <section style={{ textAlign: "center", padding: "64px 0 32px" }}>\n' +
    "        <h1>" + brand + " ships real product pages</h1>\n" +
    '        <p style={{ opacity: 0.75 }}>Describe it, preview it, export it. This starter already builds.</p>\n' +
    "        {signed ? (\n" +
    '          <p role="status">You are on the list — welcome aboard.</p>\n' +
    "        ) : (\n" +
    '          <form onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) setSigned(true); }} style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>\n' +
    '            <label htmlFor="waitlist" className="sr-only">Email</label>\n' +
    '            <input id="waitlist" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />\n' +
    '            <button type="submit">Join waitlist</button>\n' +
    "          </form>\n" +
    "        )}\n" +
    "      </section>\n" +
    '      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>\n' +
    "        {FEATURES.map((f) => (\n" +
    '          <article key={f.title} className="card">\n' +
    "            <h2>{f.title}</h2>\n" +
    "            <p>{f.text}</p>\n" +
    "          </article>\n" +
    "        ))}\n" +
    "      </section>\n" +
    "    </main>\n" +
    "  );\n" +
    "}\n"
  );
}

export function files(name: string): Record<string, string> {
  return baseFiles(name, appTsx(name), indexCss(LANDING_THEME));
}
