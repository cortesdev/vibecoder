import { beforeEach, describe, expect, it, vi } from "vitest";

// The billing decisions live in runModelPrompt, so we stub the wallet and
// credit ledgers and the DB (only reachable for BYO-key models) and keep the
// real model registry + agent resolution.

const mocks = vi.hoisted(() => ({
  ensureFreeWallet: vi.fn(),
  spendFreeTokens: vi.fn(),
  debitForRun: vi.fn(),
  refundRun: vi.fn(),
  freeCooldownRow: null as { nextAllowedAt: Date } | null,
}));

vi.mock("./db", () => ({
  db: {
    userKey: { findUnique: async () => null },
    freeCooldown: {
      findUnique: async () => mocks.freeCooldownRow,
      upsert: async () => ({}),
    },
  },
}));
vi.mock("./freewallet", () => ({
  FREE_TOKENS_PER_CREDIT: 10_000,
  ensureFreeWallet: mocks.ensureFreeWallet,
  spendFreeTokens: mocks.spendFreeTokens,
}));
vi.mock("./credits", () => ({
  debitForRun: mocks.debitForRun,
  refundRun: mocks.refundRun,
}));

import { runModelPrompt } from "./engine";

const USAGE = { inputTokens: 1_000, outputTokens: 11_345, totalTokens: 12_345 };

function runOnce() {
  return vi.fn(async () => ({ edits: [], usage: USAGE }));
}

function call(modelId: string, useFreeTokens?: boolean) {
  const run = runOnce();
  return {
    run,
    promise: runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId,
      prompt: "build a landing page",
      files: {},
      ...(useFreeTokens === undefined ? {} : { useFreeTokens }),
      run,
    }),
  };
}

// Provider keys come from the environment, so clear the ones the registry can
// read: a developer with ZAI_API_KEY / GEMINI_API_KEY exported would otherwise
// change what these tests exercise.
const PLATFORM_KEY_VARS = [
  "VIBECODER_ZAI_API_KEY",
  "ZAI_API_KEY",
  "Z_AI_API_KEY",
  "VIBECODER_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENCODE_API_KEY",
  "VIBECODER_OPENCODE_API_KEY",
  "VIBECODER_MODEL_GLM_FLASH",
  "VIBECODER_MODEL_GEMINI_FLASH",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.debitForRun.mockResolvedValue(true);
  mocks.freeCooldownRow = null; // no cooldown by default
  for (const name of PLATFORM_KEY_VARS) delete process.env[name];
});

describe("runModelPrompt — free-token wallet", () => {
  // (the free model chain itself is covered further down)
  it("pays from the wallet when it covers the run, and never touches credits", async () => {
    // sonnet costs 8 credits => 80,000 free tokens needed.
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 90_000 });
    mocks.spendFreeTokens.mockResolvedValue(77_655);

    const { run, promise } = call("sonnet");
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.freeTokensUsed).toBe(12_345); // the run's real usage, under the cap
    expect(outcome.freeTokensLeft).toBe(77_655);
    expect(outcome.freeExhausted).toBe(false);
    expect(outcome.creditsSpent).toBeUndefined();
    expect(mocks.debitForRun).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(mocks.spendFreeTokens).toHaveBeenCalledWith("u1", 12_345, expect.any(String), "Claude Sonnet");
  });

  it("leaves a part-covering wallet alone and bills credits instead", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 50_000, balance: 50_000 });

    const outcome = await call("sonnet").promise;

    expect(outcome.creditsSpent).toBe(8);
    expect(outcome.freeTokensUsed).toBeUndefined();
    expect(mocks.spendFreeTokens).not.toHaveBeenCalled(); // free tokens are not burned
    expect(mocks.debitForRun).toHaveBeenCalledTimes(1);
  });

  it("caps the spend at the model's price even when the run used more tokens", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 100_000 });
    mocks.spendFreeTokens.mockResolvedValue(20_000);
    const run = vi.fn(async () => ({
      edits: [],
      usage: { inputTokens: 1, outputTokens: 199_999, totalTokens: 200_000 },
    }));

    const outcome = await runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId: "sonnet",
      prompt: "build",
      files: {},
      run,
    });

    expect(outcome.freeTokensUsed).toBe(80_000);
    expect(mocks.spendFreeTokens).toHaveBeenCalledWith("u1", 80_000, expect.any(String), "Claude Sonnet");
  });

  it("flags the wallet as exhausted only when it actually hits zero", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 80_000 });
    mocks.spendFreeTokens.mockResolvedValue(0);

    const outcome = await call("sonnet").promise;

    expect(outcome.freeExhausted).toBe(true);
    expect(outcome.freeTokensLeft).toBe(0);
  });

  it("bills credits for the delivered run when a concurrent run drained the wallet first", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 90_000 });
    mocks.spendFreeTokens.mockResolvedValue(null); // refused: balance moved under us

    const { run, promise } = call("sonnet");
    const outcome = await promise;

    expect(outcome.creditsSpent).toBe(8);
    expect(outcome.freeExhausted).toBeUndefined(); // a refused spend is not "used up"
    expect(outcome.notice).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1); // the work is not repeated
    expect(mocks.debitForRun).toHaveBeenCalledTimes(1);
  });

  it("gives the refused run away rather than fail it when credits are empty too", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 90_000 });
    mocks.spendFreeTokens.mockResolvedValue(null);
    mocks.debitForRun.mockResolvedValue(false);

    const { run, promise } = call("sonnet");
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.creditsSpent).toBeUndefined();
    expect(outcome.notice).toContain("free");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("skips the wallet entirely when the user turns free tokens off", async () => {
    mocks.ensureFreeWallet.mockResolvedValue({ granted: 100_000, balance: 100_000 });

    const outcome = await call("sonnet", false).promise;

    expect(outcome.creditsSpent).toBe(8);
    expect(mocks.ensureFreeWallet).not.toHaveBeenCalled();
    expect(mocks.spendFreeTokens).not.toHaveBeenCalled();
  });

  it("never involves the wallet for an always-free model", async () => {
    const outcome = await call("glm-flash").promise;

    expect(outcome.creditsSpent).toBeUndefined(); // free models are never billed
    expect(mocks.ensureFreeWallet).not.toHaveBeenCalled();
    expect(mocks.spendFreeTokens).not.toHaveBeenCalled();
    expect(mocks.debitForRun).not.toHaveBeenCalled();
  });
});

describe("runModelPrompt — the free model chain", () => {
  it("gates a free run behind the cooldown and never touches the agent", async () => {
    mocks.freeCooldownRow = { nextAllowedAt: new Date(Date.now() + 12 * 60 * 1000) };

    const run = vi.fn(async () => ({ edits: [], usage: USAGE }));
    const outcome = await runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId: "glm-flash",
      prompt: "build",
      files: {},
      run,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.cooldownMs).toBeGreaterThan(0);
    expect(outcome.error).toContain("wait between them");
    expect(run).not.toHaveBeenCalled();
  });
  it("runs the requested free model when the platform holds its key", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";

    const outcome = await call("gemini-flash").promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.modelId).toBe("gemini-flash");
    expect(outcome.notice).toBeUndefined();
  });

  it("falls through to another free model instead of dead-ending", async () => {
    process.env.ZAI_API_KEY = "zai-test-key"; // glm-flash only; Google has no key

    const outcome = await call("gemini-flash").promise;

    expect(outcome.ok).toBe(true);
    expect(outcome.modelId).toBe("glm-flash");
    expect(outcome.modelLabel).toBe("GLM Flash");
    expect(outcome.notice).toContain("Gemini Flash");
    expect(mocks.debitForRun).not.toHaveBeenCalled();
  });

  it("honours a per-model id override so a rotated upstream id is an env change", async () => {
    process.env.ZAI_API_KEY = "zai-test-key";
    process.env.VIBECODER_MODEL_GLM_FLASH = "glm-9.9-flash";
    const seen: string[] = [];

    const outcome = await runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId: "glm-flash",
      prompt: "build",
      files: {},
      run: async (agent) => {
        seen.push(JSON.stringify(agent));
        return { edits: [], usage: USAGE };
      },
    });

    expect(outcome.ok).toBe(true);
    expect(seen[0]).toContain("glm-9.9-flash");
  });

  it("names the env var to set when no free provider has a key", async () => {
    const outcome = await call("glm-flash").promise;

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("ZAI_API_KEY");
    expect(outcome.error).toContain("GLM Flash");
    expect(mocks.debitForRun).not.toHaveBeenCalled();
  });
});
