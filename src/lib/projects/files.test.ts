import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ files: new Map<string, string>() }));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  fileFindUnique: vi.fn(),
  fileUpsert: vi.fn(),
  fileDelete: vi.fn(),
  fileFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: mocks.findUnique },
    projectFile: {
      findUnique: mocks.fileFindUnique,
      upsert: mocks.fileUpsert,
      deleteMany: mocks.fileDelete,
      findMany: mocks.fileFindMany,
    },
  },
}));

import {
  createProjectFile,
  deleteProjectFile,
  renameProjectFile,
  saveProjectFile,
} from "@/lib/projects";

const owned = { id: "p1", userId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  store.files.clear();
  store.files.set("src/App.tsx", "v1");
  mocks.findUnique.mockResolvedValue(owned);
  mocks.fileFindUnique.mockImplementation(async (args: { where: { projectId_path: { path: string } } }) => {
    const content = store.files.get(args.where.projectId_path.path);
    return content === undefined ? null : { path: args.where.projectId_path.path, content };
  });
  mocks.fileUpsert.mockImplementation(async (args: { create: { path: string; content: string } }) => {
    store.files.set(args.create.path, args.create.content ?? "");
  });
  mocks.fileDelete.mockImplementation(async (args: { where: { path: string } }) => {
    store.files.delete(args.where.path);
  });
  mocks.fileFindMany.mockImplementation(async () => [...store.files.entries()].map(([path, content]) => ({ path, content })));
});

describe("project file service", () => {
  it("creates files with validated paths", async () => {
    const r = await createProjectFile("u1", "p1", "src/New.ts", "x");
    expect(r.ok).toBe(true);
    expect(store.files.get("src/New.ts")).toBe("x");
    expect((await createProjectFile("u1", "p1", "../evil", "x")).ok).toBe(false);
  });

  it("refuses to overwrite an existing path on create", async () => {
    const r = await createProjectFile("u1", "p1", "src/App.tsx", "new");
    expect(r.ok).toBe(false);
    expect(store.files.get("src/App.tsx")).toBe("v1");
  });

  it("saves with conflict detection against expected content", async () => {
    expect((await saveProjectFile("u1", "p1", "src/App.tsx", "v2", "v1")).ok).toBe(true);
    const stale = await saveProjectFile("u1", "p1", "src/App.tsx", "v3", "v1");
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.conflict).toBe(true);
    expect(store.files.get("src/App.tsx")).toBe("v2");
  });

  it("renames atomically and refuses occupied targets", async () => {
    expect((await renameProjectFile("u1", "p1", "src/App.tsx", "src/Main.tsx")).ok).toBe(true);
    expect(store.files.has("src/App.tsx")).toBe(false);
    expect(store.files.get("src/Main.tsx")).toBe("v1");
    await createProjectFile("u1", "p1", "src/Other.tsx", "o");
    expect((await renameProjectFile("u1", "p1", "src/Main.tsx", "src/Other.tsx")).ok).toBe(false);
  });

  it("deletes owned files and rejects traversal", async () => {
    expect((await deleteProjectFile("u1", "p1", "src/App.tsx")).ok).toBe(true);
    expect(store.files.has("src/App.tsx")).toBe(false);
    expect((await deleteProjectFile("u1", "p1", "../x")).ok).toBe(false);
  });

  it("enforces ownership on every operation", async () => {
    mocks.findUnique.mockResolvedValue(null);
    for (const r of [
      await createProjectFile("u1", "nope", "a.ts", ""),
      await saveProjectFile("u1", "nope", "a.ts", ""),
      await renameProjectFile("u1", "nope", "a", "b"),
      await deleteProjectFile("u1", "nope", "a"),
    ]) {
      expect(r.ok).toBe(false);
    }
  });
});
