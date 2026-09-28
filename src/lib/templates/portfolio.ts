import { baseFiles, indexCss, jsString, type ThemeVars } from "./shared";

export const PORTFOLIO_THEME: ThemeVars = {
  bg: "#faf8f4",
  surface: "#ffffff",
  ink: "#26221c",
  accent: "#e8a33d",
  radius: 16,
  font: "Georgia, 'Times New Roman', serif",
};

function appTsx(name: string): string {
  const owner = jsString(name.trim() || "My App");
  return (
    'import { useState } from "react";\n' +
    "\n" +
    "const WORK = [\n" +
    '  { title: "Harbor analytics", year: "2025", text: "Real-time dashboards for a logistics team." },\n' +
    '  { title: "Fern notebooks", year: "2024", text: "A note app with offline-first sync." },\n' +
    '  { title: "Kiln ceramics", year: "2023", text: "Storefront with a one-page checkout." },\n' +
    "];\n" +
    "\n" +
    "export default function App() {\n" +
    '  const [active, setActive] = useState(0);\n' +
    "  const item = WORK[active];\n" +
    "  return (\n" +
    "    <main>\n" +
    '      <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12 }}>Portfolio</p>\n' +
    "      <h1>" + owner + "</h1>\n" +
    "      <p>Designer and front-end engineer. Selected work below.</p>\n" +
    '      <nav aria-label="Projects" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>\n' +
    "        {WORK.map((w, i) => (\n" +
    '          <button key={w.title} type="button" className={i === active ? "" : "secondary"} onClick={() => setActive(i)} aria-pressed={i === active}>\n' +
    "            {w.title}\n" +
    "          </button>\n" +
    "        ))}\n" +
    "      </nav>\n" +
    '      <article className="card" style={{ marginTop: 16 }}>\n' +
    "        <h2>{item.title} <small>({item.year})</small></h2>\n" +
    "        <p>{item.text}</p>\n" +
    '        <p><a href={"mailto:hello@example.com?subject=" + encodeURIComponent(item.title)}>Ask about this project</a></p>\n' +
    "      </article>\n" +
    "    </main>\n" +
    "  );\n" +
    "}\n"
  );
}

export function files(name: string): Record<string, string> {
  return baseFiles(name, appTsx(name), indexCss(PORTFOLIO_THEME));
}
