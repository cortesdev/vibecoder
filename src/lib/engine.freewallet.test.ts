import { beforeEach, describe, expect, it, vi } from "vitest";

// The billing decisions live in runModelPrompt, so we stub the wallet and
// credit ledgers and the DB (only reachable for BYO-key models) and keep the
// real model registry + agent resolution.

const mocks = vi.hoisted(() => ({
  ensureFreeWallet: vi.fn(),
  spendFreeTokens: vi.fn(),
  debitForRun: vi.fn(),
  refundRun: vi.fn(),
}));

vi.mock("./db", () => ({ db: { userKey: { findUnique: async () => null } } }));
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.debitForRun.mockResolvedValue(true);
});

describe("runModelPrompt — free-token wallet", () => {
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
    const outcome = await call("big-pickle").promise;

    expect(outcome.creditsSpent).toBeUndefined(); // free models are never billed
    expect(mocks.ensureFreeWallet).not.toHaveBeenCalled();
    expect(mocks.spendFreeTokens).not.toHaveBeenCalled();
    expect(mocks.debitForRun).not.toHaveBeenCalled();
  });
});
