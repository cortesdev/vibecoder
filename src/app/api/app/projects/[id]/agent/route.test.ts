import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findOwnedProject: vi.fn(),
  runTurn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/projects", () => ({ findOwnedProject: mocks.findOwnedProject }));
vi.mock("@/lib/orchestrator", () => ({ runTurn: mocks.runTurn }));

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
    mocks.runTurn.mockResolvedValue({
      status: "completed",
      reply: "done",
      modelId: "m",
      modelLabel: "M",
      changedPaths: ["src/App.tsx"],
    });
    const form = new FormData();
    form.set("message", "make it blue");
    const res = await POST(req(form), params);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).toMatchObject({ ok: true, reply: "done", changedPaths: ["src/App.tsx"], success: true });
    expect(data).toHaveProperty("exportUrl", "/api/app/projects/p1/export");
    const input = mocks.runTurn.mock.calls[0][0] as { metadata: string; agent: string };
    expect(JSON.parse(input.metadata)).toMatchObject({ exportUrl: "/api/app/projects/p1/export" });
    expect(input.agent).toBe("auto");
  });

  it("returns a completed turn with no plan-approval payload", async () => {
    mocks.runTurn.mockResolvedValue({
      status: "completed",
      reply: "done",
      modelId: "mock",
      modelLabel: "Mock Agent",
      changedPaths: ["src/App.tsx"],
      validation: { ok: true, errors: [] },
    });
    const form = new FormData();
    form.set("message", "hello");
    form.set("agent", "mock");
    const res = await POST(req(form), params);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.status).toBe("completed");
    expect((data.changedPaths as string[]).length).toBeGreaterThan(0);
    expect(data.validation).toMatchObject({ ok: true });
    for (const key of ["plan", "pendingPlan", "approval", "requiresApproval", "suggestions"]) {
      expect(data, `response must not carry ${key}`).not.toHaveProperty(key);
    }
  });

  it("passes the mock seam through only as requested", async () => {
    mocks.runTurn.mockResolvedValue({ status: "completed", reply: "m", changedPaths: [] });
    const form = new FormData();
    form.set("message", "x");
    form.set("agent", "mock");
    await POST(req(form), params);
    // Env gate off in tests: the seam stays "auto".
    expect((mocks.runTurn.mock.calls[0][0] as { agent: string }).agent).toBe("auto");
  });

  it("forwards an image_url attachment into the agent payload", async () => {
    mocks.runTurn.mockResolvedValue({ status: "completed", reply: "blue", changedPaths: [] });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "ui.png", { type: "image/png" });
    const form = new FormData();
    form.set("message", "match this");
    form.append("attachments", png);
    const res = await POST(req(form), params);
    expect(res.status).toBe(200);
    const seen = (mocks.runTurn.mock.calls[0][0] as { attachments: { kind: string }[] }).attachments;
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
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("returns 415 for spoofed content without calling the agent", async () => {
    const mz = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "evil.png", { type: "image/png" });
    const form = new FormData();
    form.set("message", "x");
    form.append("attachments", mz);
    const res = await POST(req(form), params);
    expect(res.status).toBe(415);
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("returns an actionable 415 for video with no extractor", async () => {
    const mp4 = new File(
      [new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4])],
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
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });
});
