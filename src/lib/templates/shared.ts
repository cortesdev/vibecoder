// Shared runnable Vite + React + TypeScript base for every catalog template.
// Generated sources deliberately contain no backticks and no "${" so they can
// sit inside template literals without escaping games.

export const THEME_START = "/* vibecoder:theme:start */";
export const THEME_END = "/* vibecoder:theme:end */";

export interface ThemeVars {
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  radius: number;
  font: string;
}

/** A safe npm-package-style name derived from the project name. */
export function slugFor(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "my-app"
  );
}

/** Escape a value for a double-quoted string in generated JS/TS source. */
export function jsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** Escape a value for text or attribute content in generated HTML. */
export function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The delimited theme-variable section presets rewrite (see presets/apply). */
export function themeSection(v: ThemeVars): string {
  return (
    THEME_START +
    "\n:root {\n" +
    "  --bg: " + v.bg + ";\n" +
    "  --surface: " + v.surface + ";\n" +
    "  --ink: " + v.ink + ";\n" +
    "  --accent: " + v.accent + ";\n" +
    "  --radius: " + v.radius + "px;\n" +
    "  --font: " + v.font + ";\n" +
    "}\n" +
    THEME_END
  );
}

/** Full src/index.css: theme section plus generic app styles that use it. */
export function indexCss(theme: ThemeVars, extra = ""): string {
  return (
    themeSection(theme) +
    "\n* { box-sizing: border-box; }\n" +
    "html, body { margin: 0; padding: 0; }\n" +
    "body {\n" +
    "  font-family: var(--font);\n" +
    "  background: var(--bg);\n" +
    "  color: var(--ink);\n" +
    "  line-height: 1.6;\n" +
    "  -webkit-font-smoothing: antialiased;\n" +
    "}\n" +
    "main { max-width: 960px; margin: 0 auto; padding: 48px 24px; }\n" +
    ".card {\n" +
    "  background: var(--surface);\n" +
    "  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);\n" +
    "  border-radius: var(--radius);\n" +
    "  padding: 24px;\n" +
    "}\n" +
    "button {\n" +
    "  font: inherit;\n" +
    "  border-radius: var(--radius);\n" +
    "  padding: 8px 16px;\n" +
    "  cursor: pointer;\n" +
    "  background: var(--accent);\n" +
    "  color: #fff;\n" +
    "  border: none;\n" +
    "}\n" +
    "button.secondary { background: transparent; color: var(--ink); border: 1px solid color-mix(in srgb, var(--ink) 20%, transparent); }\n" +
    "input, textarea {\n" +
    "  font: inherit;\n" +
    "  color: var(--ink);\n" +
    "  background: var(--surface);\n" +
    "  border: 1px solid color-mix(in srgb, var(--ink) 20%, transparent);\n" +
    "  border-radius: var(--radius);\n" +
    "  padding: 8px 12px;\n" +
    "}\n" +
    "a { color: var(--accent); }\n" +
    extra
  );
}

export function packageJson(name: string): string {
  return (
    "{\n" +
    '  "name": "' + slugFor(name) + '",\n' +
    '  "private": true,\n' +
    '  "version": "0.0.1",\n' +
    '  "type": "module",\n' +
    '  "scripts": {\n' +
    '    "dev": "vite",\n' +
    '    "build": "tsc -b && vite build",\n' +
    '    "preview": "vite preview"\n' +
    "  },\n" +
    '  "dependencies": {\n' +
    '    "react": "19.2.8",\n' +
    '    "react-dom": "19.2.8"\n' +
    "  },\n" +
    '  "devDependencies": {\n' +
    '    "@types/react": "^19.0.0",\n' +
    '    "@types/react-dom": "^19.0.0",\n' +
    '    "@vitejs/plugin-react": "^4.3.4",\n' +
    '    "typescript": "^5.7.0",\n' +
    '    "vite": "^6.0.0"\n' +
    "  }\n" +
    "}\n"
  );
}

export function indexHtml(name: string): string {
  const title = htmlText(name.trim() || "My App");
  return (
    "<!doctype html>\n" +
    '<html lang="en">\n' +
    "  <head>\n" +
    '    <meta charset="UTF-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    "    <title>" + title + "</title>\n" +
    "  </head>\n" +
    "  <body>\n" +
    '    <div id="root"></div>\n' +
    '    <script type="module" src="/src/main.tsx"></script>\n' +
    "  </body>\n" +
    "</html>\n"
  );
}

export function mainTsx(): string {
  return (
    'import { StrictMode } from "react";\n' +
    'import { createRoot } from "react-dom/client";\n' +
    'import "./index.css";\n' +
    'import App from "./App";\n' +
    "\n" +
    'createRoot(document.getElementById("root")!).render(\n' +
    "  <StrictMode>\n" +
    "    <App />\n" +
    "  </StrictMode>,\n" +
    ");\n"
  );
}

export function tsconfigJson(): string {
  return (
    "{\n" +
    '  "compilerOptions": {\n' +
    '    "target": "ES2022",\n' +
    '    "lib": ["ES2022", "DOM", "DOM.Iterable"],\n' +
    '    "module": "ESNext",\n' +
    '    "moduleResolution": "bundler",\n' +
    '    "jsx": "react-jsx",\n' +
    '    "strict": true,\n' +
    '    "noEmit": true,\n' +
    '    "skipLibCheck": true\n' +
    "  },\n" +
    '  "include": ["src"]\n' +
    "}\n"
  );
}

export function viteConfig(): string {
  return (
    'import { defineConfig } from "vite";\n' +
    'import react from "@vitejs/plugin-react";\n' +
    "\n" +
    "export default defineConfig({\n" +
    "  plugins: [react()],\n" +
    "});\n"
  );
}

/** The six files every template ships; App + css vary per template. */
export function baseFiles(name: string, appTsx: string, css: string): Record<string, string> {
  return {
    "index.html": indexHtml(name),
    "package.json": packageJson(name),
    "vite.config.ts": viteConfig(),
    "tsconfig.json": tsconfigJson(),
    "src/main.tsx": mainTsx(),
    "src/App.tsx": appTsx,
    "src/index.css": css,
  };
}
