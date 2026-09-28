import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findOwnedProject: vi.fn(),
  runPrompt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/projects", () => ({
  findOwnedProject: mocks.findOwnedProject,
  runPrompt: mocks.runPrompt,
}));

import { POST } from "./route";

function req(form?: FormData): Request {
  return new Request("http://x/api", form ? { method: "POST", body: form } : { method: "POST" });
}

const params = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "u1" } });
  mocks.findOwnedProject.mockResolvedValue({ id: "p1", files: [] });
});

describe("POST .../agent", () => {
  it("returns 401 without a user", async () => {
    mocks.requireUser.mockResolvedValue({ user: null });
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });

  it("returns 404 for foreign projects", async () => {
    mocks.findOwnedProject.mockResolvedValue(null);
    const form = new FormData();
    form.set("message", "hi");
    const res = await POST(req(form), params);
    expect(res.status).toBe(404);
  });

  it("rejects empty turns", async () => {
    const res = await POST(req(new FormData()), params);
    expect(res.status).toBe(400);
  });

  it("runs a text turn and returns the typed contract", async () => {
    mocks.runPrompt.mockResolvedValue({
      ok: true,
      reply: "done",
      modelId: "m",
      modelLabel: "M",
      changedPaths: ["src/App.tsx"],
      success: true,
    });
    const form = new FormData();
    form.set("message", "make it blue");
    const res = await POST(req(form), params);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).toMatchObject({ ok: true, reply: "done", changedPaths: ["src/App.tsx"], success: true });
    expect(data).toHaveProperty("exportUrl", "/api/app/projects/p1/export");
    const meta = mocks.runPrompt.mock.calls[0][10] as string;
    expect(JSON.parse(meta)).toMatchObject({ exportUrl: "/api/app/projects/p1/export" });
  });

  it("forwards an image_url attachment into the agent payload", async () => {
    mocks.runPrompt.mockResolvedValue({ ok: true, reply: "blue", changedPaths: [], success: true });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "ui.png", { type: "image/png" });
    const form = new FormData();
    form.set("message", "match this");
    form.append("attachments", png);
    const res = await POST(req(form), params);
    expect(res.status).toBe(200);
    const seen = mocks.runPrompt.mock.calls[0][9] as { kind: string }[];
    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe("image");
  });

  it("returns 413 for oversize files without calling the agent", async () => {
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const form = new FormData();
    form.set("message", "x");
    form.append("attachments", big);
    const res = await POST(req(form), params);
    expect(res.status).toBe(413);
    const data = (await res.json()) as Record<string, unknown>;
    expect(String(data.error)).toContain("8 MB per file");
    expect(mocks.runPrompt).not.toHaveBeenCalled();
  });

  it("returns 415 for spoofed content without calling the agent", async () => {
    const mz = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "evil.png", { type: "image/png" });
    const form = new FormData();
    form.set("message", "x");
    form.append("attachments", mz);
    const res = await POST(req(form), params);
    expect(res.status).toBe(415);
    expect(mocks.runPrompt).not.toHaveBeenCalled();
  });

  it("returns an actionable 415 for video with no extractor", async () => {
    const mp4 = new File(
      [new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3])],
      "clip.mp4",
      { type: "video/mp4" },
    );
    const form = new FormData();
    form.set("message", "x");
    form.append("attachments", mp4);
    const res = await POST(req(form), params);
    expect(res.status).toBe(415);
    const data = (await res.json()) as Record<string, unknown>;
    expect(String(data.error)).toContain("cannot process video");
    expect(mocks.runPrompt).not.toHaveBeenCalled();
  });
});
