import { db } from "./db";
import { runModelPrompt } from "./engine";
import { isValidProjectPath, sanitizePath } from "./agent/paths";
import { presetCss, PRESETS } from "./presets";

// White-label starter site. Every new project begins as a small but real Vite +
// React + TypeScript app that already looks like something: a rounded-square
// SVG logo carrying the brand's initial (so it works for any name), the
// project's own name, and a dark/light switch a visitor can actually click.
// That makes the Preview pane proof the pipeline works — a rendered page, not
// an empty frame — and it is the baseline the agent edits from.
//
// The generated sources deliberately contain no backticks and no "${" so they
// can sit inside the template literals below without escaping games.

/** A safe npm-package-style name derived from the project name. */
function slugFor(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "my-app"
  );
}

/** Escape a value for a double-quoted string in generated JS/TS source. */
function jsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

/** Escape a value for text or attribute content in generated HTML. */
function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Scaffold a new project's files. The project name is the brand shown on the
 * page, and it is escaped for each place it lands — the HTML title, the
 * package name, and a TS string literal — so a name can never break the build.
 */
export function scaffoldFor(rawName: string): Record<string, string> {
  const name = rawName.trim() || "My App";
  const js = jsString(name);
  const html = htmlText(name);
  const slug = slugFor(name);

  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${html}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "package.json": `{
  "name": "${slug}",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    "src/App.tsx": `import { useEffect, useState } from "react";

const BRAND = "${js}";
const THEME_KEY = "site-theme";

type Theme = "dark" | "light";

function Mark() {
  const initial = (BRAND.trim().charAt(0) || "A").toUpperCase();
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" role="img" aria-label={BRAND}>
      <defs>
        <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--mark-a)" />
          <stop offset="100%" stopColor="var(--mark-b)" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="12" fill="url(#mark)" />
      <text
        x="22"
        y="30"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <main className="page">
      <header className="bar">
        <Mark />
        <div>
          <h1 className="brand">{BRAND}</h1>
          <p className="tagline">A simple site, ready for the agent to build on.</p>
        </div>
        <button
          type="button"
          className="switch"
          onClick={() => setTheme(next)}
          aria-label={"Switch to " + next + " mode"}
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </header>

      <section className="hero">
        <h2>Start here</h2>
        <p>
          Ask the agent to change this page. Every edit arrives as a diff you can
          review before it is applied, and the preview re-renders on its own.
        </p>
      </section>
    </main>
  );
}
`,
    "src/index.css": `:root,
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0a0a0c;
  --panel: #131319;
  --ink: #f2f2f4;
  --ink-2: #a1a1ad;
  --line: #24242e;
  --mark-a: #6d5efc;
  --mark-b: #22d3ee;
}

:root[data-theme="light"] {
  color-scheme: light;
  --bg: #ffffff;
  --panel: #f6f6f9;
  --ink: #101014;
  --ink-2: #5b5b68;
  --line: #e4e4ea;
  --mark-a: #5b4bf5;
  --mark-b: #0ea5b7;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, sans-serif;
  transition: background 160ms ease, color 160ms ease;
}

.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.tagline {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.switch {
  margin-left: auto;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  border-radius: 999px;
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.switch:hover {
  border-color: var(--ink-2);
}

.hero {
  margin-top: 40px;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel);
}

.hero h2 {
  margin: 0 0 8px;
  font-size: 24px;
  letter-spacing: -0.02em;
}

.hero p {
  margin: 0;
  color: var(--ink-2);
  line-height: 1.6;
}
`,
  };
}

/** Every query is scoped by userId; returns null when the caller doesn't own it. */
export async function findOwnedProject(userId: string, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { files: { orderBy: { path: "asc" } }, changes: { orderBy: { createdAt: "asc" } } },
  });
  if (!project || project.userId !== userId) return null;
  return project;
}

export async function createProject(userId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required.");
  return db.project.create({
    data: {
      userId,
      name: trimmed,
      files: {
        create: Object.entries(scaffoldFor(trimmed)).map(([path, content]) => ({ path, content })),
      },
    },
  });
}

export interface PromptAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export async function runPrompt(
  userId: string,
  projectId: string,
  content: string,
  modelId?: string,
  useFreeTokens = true,
  attachments: PromptAttachment[] = [],
) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false as const, error: "Prompt is empty." };

  const files = Object.fromEntries(project.files.map((f) => [f.path, f.content]));

  // Attachments ride along as context so the agent knows what it has to work with.
  const attachmentNote =
    attachments.length > 0
      ? `\n\nAttachments:\n${attachments
          .map((a) => {
            const kind = a.type.startsWith("image/") ? "image" : a.type.startsWith("video/") ? "video" : "file";
            const img = a.dataUrl && kind === "image" ? " (image data embedded)" : "";
            return `- ${a.name} (${kind}, ${a.size} bytes)${img}`;
          })
          .join("\n")}`
      : "";
  const agentText = `${trimmed}${attachmentNote}`;

  const outcome = await runModelPrompt({
    userId,
    projectId,
    modelId,
    prompt: trimmed,
    files,
    useFreeTokens,
    run: async (agent) => {
      let result;
      try {
        result = await agent.run(agentText, files);
      } catch (err) {
        throw err instanceof Error ? err : new Error("agent failed");
      }
      return result;
    },
  });

  if (!outcome.ok || !outcome.edits) {
    return {
      ok: false as const,
      error: outcome.error ?? "agent failed",
      notice: outcome.notice,
      cooldownMs: outcome.cooldownMs,
    };
  }
  const edits = outcome.edits;

  const valid = edits.filter((e) => {
    if (!isValidProjectPath(e.path)) return false;
    const current = files[e.path] ?? "";
    return e.before === current && e.after !== current;
  });

  if (valid.length === 0) {
    return { ok: false as const, error: "No usable changes from the agent." };
  }

  const prompt = await db.prompt.create({
    data: {
      projectId,
      content: trimmed,
      changes: {
        create: valid.map((e) => ({
          projectId,
          path: sanitizePath(e.path),
          before: e.before,
          after: e.after,
        })),
      },
    },
    include: { changes: true },
  });

  return {
    ok: true as const,
    prompt,
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    usage: outcome.usage,
    usedFallback: outcome.usedFallback,
    creditsSpent: outcome.creditsSpent,
    freeTokensUsed: outcome.freeTokensUsed,
    freeTokensLeft: outcome.freeTokensLeft,
    freeExhausted: outcome.freeExhausted,
    notice: outcome.notice,
  };
}

/** Apply a pending change: write `after` into the project file. */
export async function applyChange(userId: string, changeId: string) {
  const change = await db.change.findUnique({ where: { id: changeId }, include: { project: true } });
  if (!change || change.project.userId !== userId) return { ok: false as const, error: "not_found" };
  if (change.status !== "pending") return { ok: false as const, error: "already_applied" };

  await db.$transaction([
    db.projectFile.upsert({
      where: { projectId_path: { projectId: change.projectId, path: change.path } },
      create: { projectId: change.projectId, path: change.path, content: change.after },
      update: { content: change.after },
    }),
    db.change.update({
      where: { id: change.id },
      data: { status: "applied", appliedAt: new Date() },
    }),
  ]);
  return { ok: true as const };
}

/** Revert an applied change: restore `before` into the project file. */
export async function revertChange(userId: string, changeId: string) {
  const change = await db.change.findUnique({ where: { id: changeId }, include: { project: true } });
  if (!change || change.project.userId !== userId) return { ok: false as const, error: "not_found" };
  if (change.status !== "applied") return { ok: false as const, error: "not_applied" };

  await db.$transaction([
    db.projectFile.update({
      where: { projectId_path: { projectId: change.projectId, path: change.path } },
      data: { content: change.before },
    }),
    db.change.update({ where: { id: change.id }, data: { status: "reverted" } }),
  ]);
  return { ok: true as const };
}

/** Direct editor save. Returns null result object when not owned / bad path. */
export async function saveFile(userId: string, projectId: string, rawPath: string, content: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const path = sanitizePath(rawPath);
  if (!isValidProjectPath(path)) return { ok: false as const, error: "invalid_path" as const };

  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, content },
    update: { content },
  });
  return { ok: true as const };
}

export const PRESET_CSS_PATH = "src/index.css";

/** Apply a UI preset: rewrite src/index.css with the preset stylesheet. */
export async function applyPreset(userId: string, projectId: string, slug: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const preset = PRESETS.find((p) => p.slug === slug);
  if (!preset) return { ok: false as const, error: "unknown_preset" as const };
  const css = presetCss(preset);

  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path: PRESET_CSS_PATH } },
    create: { projectId, path: PRESET_CSS_PATH, content: css },
    update: { content: css },
  });
  return { ok: true as const, slug: preset.slug, name: preset.name, file: { path: PRESET_CSS_PATH, content: css } };
}

/** Service credentials a user has connected (counts per service only). */
export async function listServiceKeys(userId: string): Promise<Record<string, number>> {
  const keys = await db.serviceKey.findMany({ where: { userId }, select: { serviceSlug: true } });
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k.serviceSlug] = (counts[k.serviceSlug] ?? 0) + 1;
  return counts;
}

/** Add a credential for an integration. Returns the new counts. */
export async function addServiceKey(userId: string, serviceSlug: string, key: string, label: string) {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false as const, error: "Key is required." as const };
  await db.serviceKey.create({ data: { userId, serviceSlug, label: label.trim() || "Primary", key: trimmed } });
  const counts = await listServiceKeys(userId);
  return { ok: true as const, counts };
}

/** Remove all credentials for one integration. Returns new counts. */
export async function removeServiceKey(userId: string, serviceSlug: string) {
  await db.serviceKey.deleteMany({ where: { userId, serviceSlug } });
  const counts = await listServiceKeys(userId);
  return { ok: true as const, counts };
}