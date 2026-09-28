import { baseFiles, indexCss, type ThemeVars } from "./shared";

export const DASHBOARD_THEME: ThemeVars = {
  bg: "#f4f6fb",
  surface: "#ffffff",
  ink: "#1b2433",
  accent: "#7c3aed",
  radius: 12,
  font: "system-ui, -apple-system, sans-serif",
};

const APP_TSX =
  'import { useMemo, useState } from "react";\n' +
  "\n" +
  "const SEED = [\n" +
  '  { name: "Acme", plan: "Studio", mrr: 49, status: "active" },\n' +
  '  { name: "Globex", plan: "Builder", mrr: 20, status: "trial" },\n' +
  '  { name: "Initech", plan: "Starter", mrr: 5, status: "past_due" },\n' +
  '  { name: "Umbrella", plan: "Studio", mrr: 60, status: "active" },\n' +
  "];\n" +
  "\n" +
  "export default function App() {\n" +
  '  const [query, setQuery] = useState("");\n' +
  '  const [rows, setRows] = useState(SEED);\n' +
  "  const filtered = rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));\n" +
  "  const mrr = useMemo(() => filtered.reduce((sum, r) => sum + r.mrr, 0), [filtered]);\n" +
  "  return (\n" +
  "    <main>\n" +
  "      <h1>Revenue dashboard</h1>\n" +
  '      <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>\n' +
  '        <div className="card"><strong>{mrr}$ MRR</strong><p>{filtered.length} customers in view</p></div>\n' +
  '        <div className="card"><strong>{rows.filter((r) => r.status === "trial").length} trials</strong><p>convert them this week</p></div>\n' +
  "      </section>\n" +
  '      <section className="card" style={{ marginTop: 16 }}>\n' +
  '        <label htmlFor="q">Filter customers</label>\n' +
  '        <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name…" style={{ marginLeft: 8 }} />\n' +
  '        <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>\n' +
  "          <thead><tr><th align=\"left\">Customer</th><th align=\"left\">Plan</th><th align=\"right\">MRR</th><th align=\"left\">Status</th><th /></tr></thead>\n" +
  "          <tbody>\n" +
  "            {filtered.map((r) => (\n" +
  '              <tr key={r.name} style={{ borderTop: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)" }}>\n' +
  "                <td>{r.name}</td><td>{r.plan}</td><td align=\"right\">{r.mrr}$</td><td>{r.status}</td>\n" +
  "                <td align=\"right\">\n" +
  '                  <button type="button" className="secondary" onClick={() => setRows(rows.filter((x) => x.name !== r.name))}>Remove</button>\n' +
  "                </td>\n" +
  "              </tr>\n" +
  "            ))}\n" +
  "          </tbody>\n" +
  "        </table>\n" +
  "      </section>\n" +
  "    </main>\n" +
  "  );\n" +
  "}\n";

export function files(name: string): Record<string, string> {
  return baseFiles(name, APP_TSX, indexCss(DASHBOARD_THEME));
}
