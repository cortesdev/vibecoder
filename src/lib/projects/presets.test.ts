import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_START, THEME_END } from "@/lib/templates/shared";

const BASE_CSS = [
  THEME_START,
  ":root {",
  "  --bg: #000;",
  "  --surface: #111;",
  "  --ink: #eee;",
  "  --accent: #00f;",
  "  --radius: 8px;",
  "  --font: serif;",
  "}",
  THEME_END,
  ".custom { margin: 3px; }",
].join("\n");

const store = vi.hoisted(() => ({
  files: new Map<string, string>(),
  project: { id: "p1", userId: "u1", activePresetId: null as string | null },
  prompts: [] as { id: string; metadata: string | null }[],
}));

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateProject: vi.fn(),
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  deleteFiles: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findUnique: async () => ({
        ...store.project,
        files: [...store.files.entries()].map(([path, content]) => ({ path, content })),
        changes: [],
      }),
      update: mocks.updateProject,
    },
    projectFile: {
      upsert: mocks.upsert,
      deleteMany: mocks.deleteFiles,
    },
    prompt: {
      create: mocks.createPrompt,
      update: mocks.updatePrompt,
      findMany: async () => store.prompts,
    },
  },
}));

import { applyProjectPreset, undoProjectPreset } from "@/lib/projects";

beforeEach(() => {
  vi.clearAllMocks();
  store.files.clear();
  store.prompts.length = 0;
  store.project.activePresetId = null;
  mocks.upsert.mockImplementation(async (args: { create: { content: string }; update: { content: string } }) => {
    store.files.set("src/index.css", args.create.content ?? args.update.content);
  });
  mocks.createPrompt.mockImplementation(async (args: { data: { metadata?: string } }) => {
    const row = { id: `pr-${store.prompts.length}`, metadata: args.data.metadata ?? null };
    store.prompts.unshift(row);
    return row;
  });
  mocks.updateProject.mockImplementation(async (args: { data: { activePresetId?: string | null } }) => {
    if ("activePresetId" in args.data) store.project.activePresetId = args.data.activePresetId ?? null;
  });
});

describe("preset apply/undo state", () => {
  it("applies a theme, preserves custom CSS, stores undo bytes, persists selection", async () => {
    store.files.set("src/index.css", BASE_CSS);
    const r = await applyProjectPreset("u1", "p1", "coral");
    expect(r.ok).toBe(true);
    const written = store.files.get("src/index.css")!;
    expect(written).toContain("--accent: #ff5c39;");
    expect(written).toContain(".custom { margin: 3px; }");
    expect(store.project.activePresetId).toBe("coral");
    const meta = JSON.parse(store.prompts[0].metadata!);
    expect(meta.presetUndo.previousCss).toBe(BASE_CSS);
    expect(meta.presetUndo.previousPresetId).toBeNull();
    expect(meta.presetUndo.appliedCss).toBe(written);
  });

  it("undo restores byte-identical CSS and the prior selection", async () => {
    store.files.set("src/index.css", BASE_CSS);
    await applyProjectPreset("u1", "p1", "coral");
    mocks.updatePrompt.mockImplementation(async (args: { where: { id: string }; data: { metadata: string } }) => {
      const row = store.prompts.find((p) => p.id === args.where.id)!;
      row.metadata = args.data.metadata;
    });
    const u = await undoProjectPreset("u1", "p1");
    expect(u.ok).toBe(true);
    expect(store.files.get("src/index.css")).toBe(BASE_CSS);
    expect(store.project.activePresetId).toBeNull();
  });

  it("refuses undo after a later edit instead of overwriting", async () => {
    store.files.set("src/index.css", BASE_CSS);
    await applyProjectPreset("u1", "p1", "coral");
    store.files.set("src/index.css", store.files.get("src/index.css")! + "\n.later { color: red; }\n");
    const u = await undoProjectPreset("u1", "p1");
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.error).toContain("changed after");
    expect(store.files.get("src/index.css")).toContain(".later");
  });

  it("rejects a stylesheet without delimiters readably", async () => {
    store.files.set("src/index.css", "h1 { color: red; }");
    const r = await applyProjectPreset("u1", "p1", "coral");
    expect(r.ok).toBe(false);
  });

  it("creates the stylesheet when the project has none", async () => {
    const r = await applyProjectPreset("u1", "p1", "terminal");
    expect(r.ok).toBe(true);
    expect(store.files.get("src/index.css")).toContain("--accent: #33ff66;");
  });
});
