import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPrompt: vi.fn(),
  findOwnedProject: vi.fn(),
  restoreProjectFiles: vi.fn(),
  updatePromptMetadata: vi.fn(),
  validateProject: vi.fn(),
}));

vi.mock("./projects", () => ({
  runPrompt: mocks.runPrompt,
  findOwnedProject: mocks.findOwnedProject,
  restoreProjectFiles: mocks.restoreProjectFiles,
  updatePromptMetadata: mocks.updatePromptMetadata,
}));
vi.mock("./preview/validate", () => ({ validateProject: mocks.validateProject }));

import { resolveVisionModel, runTurn } from "./orchestrator";

const SNAPSHOT = [{ path: "src/App.tsx", content: "export default 1" }];

function okRun(changedPaths: string[] = ["src/App.tsx"]) {
  return {
    ok: true,
    reply: "done",
    modelId: "groq-gpt-oss",
    modelLabel: "Groq",
    changedPaths,
    success: true,
    assistantPromptId: "p1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOwnedProject.mockResolvedValue({ files: SNAPSHOT });
  mocks.restoreProjectFiles.mockResolvedValue({ ok: true });
  mocks.updatePromptMetadata.mockResolvedValue({ ok: true });
});

describe("resolveVisionModel", () => {
  it("keeps the requested model when it can see images", () => {
    expect(resolveVisionModel("sonnet", true)).toEqual({ modelId: "sonnet" });
  });

  it("reroutes an image turn off a blind model with a notice", () => {
    const out = resolveVisionModel("groq-gpt-oss", true);
    expect(out.modelId).not.toBe("groq-gpt-oss");
    expect(out.reroute).toMatch(/cannot see images/i);
  });

  it("fails a vision turn unserved rather than sending blind", () => {
    const out = resolveVisionModel("groq-gpt-oss", true, { hasVisionFallback: false });
    expect(out.unservable).toMatch(/no vision-capable model/i);
  });

  it("does not reroute a text-only turn", () => {
    expect(resolveVisionModel("groq-gpt-oss", false)).toEqual({ modelId: "groq-gpt-oss" });
  });
});

describe("runTurn", () => {
  it("maps a successful run to a completed outcome", async () => {
    mocks.runPrompt.mockResolvedValue(okRun());
    mocks.validateProject.mockResolvedValue({ ok: true, errors: [] });
    const out = await runTurn({ userId: "u", projectId: "p", text: "hi" });
    expect(out).toMatchObject({ status: "completed", changedPaths: ["src/App.tsx"] });
    expect(mocks.runPrompt.mock.calls[0][11]).toBe("auto");
  });

  it("maps failures to failed with the actionable reason", async () => {
    mocks.runPrompt.mockResolvedValue({ ok: false, error: "No free provider is configured." });
    const out = await runTurn({ userId: "u", projectId: "p", text: "hi", agent: "mock" });
    expect(out).toMatchObject({ status: "failed", error: "No free provider is configured." });
    expect(mocks.runPrompt.mock.calls[0][11]).toBe("mock");
  });

  it("completes an answer-only turn without validating", async () => {
    mocks.runPrompt.mockResolvedValue(okRun([]));
    const out = await runTurn({ userId: "u", projectId: "p", text: "hi" });
    expect(out).toMatchObject({ status: "completed", changedPaths: [] });
    expect(mocks.validateProject).not.toHaveBeenCalled();
  });

  it("refuses an image turn no configured model can see", async () => {
    const out = await runTurn({
      userId: "u",
      projectId: "p",
      text: "match this",
      modelId: "groq-gpt-oss",
      attachments: [
        { kind: "image", name: "a.png", mimeType: "image/png", imageUrl: "data:image/png;base64,AA", detail: "auto" },
      ],
    }, { hasVisionFallback: false });
    expect(out.status).toBe("failed");
    expect(mocks.runPrompt).not.toHaveBeenCalled();
  });

  it("restores the last working revision when the repair also fails", async () => {
    mocks.runPrompt.mockResolvedValue(okRun());
    mocks.validateProject.mockResolvedValue({ ok: false, errors: [{ path: "src/App.tsx", message: "Could not resolve" }] });
    const out = await runTurn({ userId: "u", projectId: "p", text: "hi" });
    expect(out.status).toBe("failed");
    expect(mocks.restoreProjectFiles).toHaveBeenCalledWith("u", "p", { "src/App.tsx": "export default 1" });
  });

  it("attempts at most one repair and completes when it passes", async () => {
    mocks.runPrompt.mockResolvedValue(okRun());
    mocks.validateProject
      .mockResolvedValueOnce({ ok: false, errors: [{ path: "src/App.tsx", message: "Could not resolve" }] })
      .mockResolvedValueOnce({ ok: true, errors: [] });
    const out = await runTurn({ userId: "u", projectId: "p", text: "hi" });
    expect(mocks.runPrompt).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ status: "completed", validation: { ok: true, repaired: true } });
    expect(mocks.restoreProjectFiles).not.toHaveBeenCalled();
  });

  it("records validation metadata on the assistant turn", async () => {
    mocks.runPrompt.mockResolvedValue(okRun());
    mocks.validateProject.mockResolvedValue({ ok: true, errors: [] });
    await runTurn({ userId: "u", projectId: "p", text: "hi" });
    expect(mocks.updatePromptMetadata).toHaveBeenCalledWith("u", "p1", {
      validation: { ok: true, errors: [] },
    });
  });
});
