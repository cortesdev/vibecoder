import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findOwnedProject: vi.fn(),
  createProjectFile: vi.fn(),
  renameProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
  saveProjectFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/projects", () => ({
  findOwnedProject: mocks.findOwnedProject,
  createProjectFile: mocks.createProjectFile,
  renameProjectFile: mocks.renameProjectFile,
  deleteProjectFile: mocks.deleteProjectFile,
  saveProjectFile: mocks.saveProjectFile,
}));

import { DELETE as deleteFile, PATCH as rename, POST as create } from "./route";
import { GET as read, PUT as save } from "./[...path]/route";

const id = { params: Promise.resolve({ id: "p1" }) };
const at = (segments: string[]) => ({ params: Promise.resolve({ id: "p1", path: segments }) });

function json(body: unknown): Request {
  return new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "u1" } });
});

describe("file collection routes", () => {
  it("401s without a user", async () => {
    mocks.requireUser.mockResolvedValue({ user: null });
    expect((await create(json({ path: "a.ts" }), id)).status).toBe(401);
  });

  it("creates and reports occupied targets as 409", async () => {
    mocks.createProjectFile.mockResolvedValue({ ok: true, path: "a.ts" });
    expect((await create(json({ path: "a.ts" }), id)).status).toBe(201);
    mocks.createProjectFile.mockResolvedValue({ ok: false, error: "exists" });
    expect((await create(json({ path: "a.ts" }), id)).status).toBe(409);
  });

  it("renames and deletes through the service", async () => {
    mocks.renameProjectFile.mockResolvedValue({ ok: true, path: "b.ts" });
    const r = await rename(json({ from: "a.ts", to: "b.ts" }), id);
    expect(r.status).toBe(200);
    mocks.deleteProjectFile.mockResolvedValue({ ok: true, path: "b.ts" });
    mocks.findOwnedProject.mockResolvedValue({ files: [] });
    const d = await deleteFile(json({ path: "b.ts" }), id);
    expect(d.status).toBe(200);
  });
});

describe("single file routes", () => {
  it("reads owned files and 404s strangers", async () => {
    mocks.findOwnedProject.mockResolvedValue({ files: [{ path: "a.ts", content: "hi" }] });
    expect(((await (await read(new Request("http://x"), at(["a.ts"]))).json()) as { content: string }).content).toBe("hi");
    mocks.findOwnedProject.mockResolvedValue(null);
    expect((await read(new Request("http://x"), at(["a.ts"]))).status).toBe(404);
  });

  it("saves and surfaces conflicts with current bytes", async () => {
    mocks.saveProjectFile.mockResolvedValue({ ok: true, path: "a.ts" });
    expect((await save(json({ content: "v2", expectedContent: "v1" }), at(["a.ts"]))).status).toBe(200);
    mocks.saveProjectFile.mockResolvedValue({ ok: false, error: "conflict", conflict: true, current: "v2" });
    const res = await save(json({ content: "v3", expectedContent: "v1" }), at(["a.ts"]));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { current: string }).current).toBe("v2");
  });
});
