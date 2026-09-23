import { db } from "./db";
import { makeAgent } from "./agent";
import { isValidProjectPath, sanitizePath } from "./agent/paths";

// Minimal Vite + React + TypeScript scaffold, scaffolded as project files.
export const SCAFFOLD: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Vibecoder Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "package.json": `{
  "name": "my-vibecoder-project",
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
  "src/App.tsx": `export default function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <h1>Hello from Vibecoder</h1>
      <p>Talk to the agent to start building.</p>
    </main>
  );
}
`,
  "src/index.css": `body {
  margin: 0;
  background: #0a0a0c;
  color: #f2f2f4;
}
`,
};

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
        create: Object.entries(SCAFFOLD).map(([path, content]) => ({ path, content })),
      },
    },
  });
}

export async function runPrompt(userId: string, projectId: string, content: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false as const, error: "Prompt is empty." };

  const files = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  const agent = makeAgent();
  let edits;
  try {
    edits = await agent.run(trimmed, files);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "agent failed" };
  }

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

  return { ok: true as const, prompt };
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