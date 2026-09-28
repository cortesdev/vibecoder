import { beforeEach, describe, expect, it, vi } from "vitest";

// Every model is free-tier now, so runModelPrompt has no wallet, no cooldown,
// and no billing. This stubs the db (only reachable for BYO keys) and scrubs
// the provider keys, then keeps the real registry + agent resolution.

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("./db", () => ({
  db: { userKey: { findUnique: mocks.findUnique } },
}));

import { runModelPrompt } from "./engine";

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

// A developer with any of these exported must not change what the tests
// exercise. VIBECODER_BASE_URL_CUSTOM is included because it is what makes the
// custom-auto gateway configured.
const PLATFORM_KEY_VARS = [
  "VIBECODER_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY",
  "VIBECODER_OPENAI_API_KEY", "OPENAI_API_KEY",
  "VIBECODER_OPENCODE_API_KEY", "OPENCODE_API_KEY",
  "VIBECODER_ZAI_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY",
  "VIBECODER_CEREBRAS_API_KEY", "CEREBRAS_API_KEY",
  "VIBECODER_HF_TOKEN", "HF_TOKEN", "HUGGINGFACE_API_KEY",
  "VIBECODER_CUSTOM_API_KEY", "CUSTOM_API_KEY", "FREELLMAPI_API_KEY",
  "VIBECODER_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY",
  "VIBECODER_GROQ_API_KEY", "GROQ_KEY", "GROQ_API_KEY",
  "VIBECODER_OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPENROUTER_API_KEY",
  "VIBECODER_NVIDIA_API_KEY", "NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY",
  "VIBECODER_BASE_URL_CUSTOM",
  "VIBECODER_MODEL_GEMINI_FLASH",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  for (const name of PLATFORM_KEY_VARS) delete process.env[name];
});

function runOk() {
  return vi.fn(async () => ({ edits: [{ path: "a.ts", before: "", after: "x" }], usage: USAGE }));
}

describe("runModelPrompt — no paid gate", () => {
  it("runs a formerly-hosted model for free when only its platform key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test";
    const run = runOk();

    const outcome = await runModelPrompt({
      userId: "u1", projectId: "p1", modelId: "sonnet", prompt: "build", files: {}, run,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.modelId).toBe("sonnet");
    expect(outcome.creditsSpent).toBeUndefined();
    expect(outcome.usedFallback).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never touches a wallet — the db mock exposes only userKey", async () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    const outcome = await runModelPrompt({
      userId: "u1", projectId: "p1", modelId: "gemini-flash", prompt: "hi", files: {}, run: runOk(),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.modelId).toBe("gemini-flash");
  });

  it("falls through the chain deterministically to the next keyed model", async () => {
    // Nemotron has no key; Gemini does. The chain skips the unkeyed model.
    process.env.GEMINI_API_KEY = "gemini-test";
    const outcome = await runModelPrompt({
      userId: "u1", projectId: "p1", modelId: "nemotron", prompt: "hi", files: {}, run: runOk(),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.modelId).toBe("gemini-flash");
    expect(outcome.notice).toContain("Nemotron");
  });

  it("honours a per-model id override so a rotated upstream id is an env change", async () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.VIBECODER_MODEL_GEMINI_FLASH = "gemini-9.9-flash";
    const seen: string[] = [];

    const outcome = await runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId: "gemini-flash",
      prompt: "build",
      files: {},
      run: async (agent) => {
        seen.push(JSON.stringify(agent));
        return { edits: [], usage: USAGE };
      },
    });

    expect(outcome.ok).toBe(true);
    expect(seen[0]).toContain("gemini-9.9-flash");
  });

  it("names the env var to set when no provider has a key", async () => {
    const outcome = await runModelPrompt({
      userId: "u1", projectId: "p1", modelId: "gemini-flash", prompt: "hi", files: {}, run: runOk(),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("GEMINI_API_KEY");
  });
});
