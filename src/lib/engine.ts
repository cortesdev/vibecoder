import { db } from "./db";
import { getModel, DEFAULT_MODEL_ID, FREE_FALLBACK_ID, type ModelDef } from "./models";
import { debitForRun, refundRun } from "./credits";
import { FREE_TOKENS_PER_CREDIT, ensureFreeWallet, spendFreeTokens } from "./freewallet";
import { LlmAgent, type LlmConfig } from "./agent/llm";
import { MockAgent } from "./agent/mock";
import type { Agent } from "./agent/types";

// OpenAI-compatible endpoints per provider. Anthropic exposes an OpenAI-
// compatible surface at /v1; Z.ai and OpenCode Zen are OpenAI-compatible too.
const PROVIDER_BASE_URL: Record<string, string> = {
  opencode: "https://opencode.ai/zen/v1",
  zai: "https://api.z.ai/api/paas/v4",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
};

export interface RunOutcome {
  ok: boolean;
  error?: string;
  edits?: import("./agent/types").FileEdit[];
  usage?: import("./agent/types").TokenUsage;
  modelId?: string;
  modelLabel?: string;
  usedFallback?: boolean;
  creditsSpent?: number;
  // Free-token wallet accounting (free-first runs).
  freeTokensUsed?: number;
  freeTokensLeft?: number;
  freeExhausted?: boolean;
  notice?: string;
}

async function keyFor(userId: string, provider: string): Promise<string | null> {
  const row = await db.userKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  return row?.key ?? null;
}

function platformConfig(m: ModelDef): LlmConfig | null {
  // Platform-hosted (credits) models use VIBECODER_<PROVIDER>_API_KEY env;
  // the opencode provider (Big Pickle / Grok Code) uses OPENCODE_API_KEY.
  const envKey =
    m.provider === "anthropic"
      ? process.env.VIBECODER_ANTHROPIC_API_KEY
      : m.provider === "openai"
        ? process.env.VIBECODER_OPENAI_API_KEY
        : m.provider === "opencode"
          ? process.env.OPENCODE_API_KEY ?? process.env.VIBECODER_OPENCODE_API_KEY
          : undefined;
  if (!envKey) return null;
  return {
    apiKey: envKey,
    baseUrl: PROVIDER_BASE_URL[m.provider],
    model: m.model,
  };
}

async function resolveAgent(
  userId: string,
  model: ModelDef,
): Promise<{ agent: Agent | null; problem?: string }> {
  // 1. The user's own BYO key wins when they've added one.
  if (model.byok) {
    const key = await keyFor(userId, model.provider);
    if (key) {
      return {
        agent: new LlmAgent({
          apiKey: key,
          baseUrl: PROVIDER_BASE_URL[model.provider],
          model: model.model,
        }),
      };
    }
  }

  // 2. Platform key fallback — lets online users run without adding a key of
  // their own when the platform provides one (e.g. OPENCODE_API_KEY).
  const cfg = platformConfig(model);
  if (cfg) return { agent: new LlmAgent(cfg) };

  if (model.byok || model.tier === "free") {
    return {
      agent: null,
      problem: `${model.label} needs a free ${model.provider} API key — add it in Settings (it takes a minute).`,
    };
  }

  // Credits tier: platform key required; if we don't have one configured,
  // degrade to the mock so the product still works end to end.
  return { agent: new MockAgent() };
}

/**
 * Run one prompt through the requested model. Paid models debit credits
 * first (atomic); any failure refunds, and a drained wallet falls back to
 * the default free model so the user is never blocked.
 */
export async function runModelPrompt(input: {
  userId: string;
  projectId: string;
  modelId: string | undefined;
  prompt: string;
  files: Record<string, string>;
  /** Pay for hosted runs from the free-token wallet before credits (default). */
  useFreeTokens?: boolean;
  run: (agent: Agent) => Promise<import("./agent/types").AgentResult>;
}): Promise<RunOutcome> {
  const requested = input.modelId ? getModel(input.modelId) : null;
  const model = requested ?? getModel(DEFAULT_MODEL_ID)!;

  // --- Free / BYO path -----------------------------------------------------
  if (model.tier === "free") {
    const { agent, problem } = await resolveAgent(input.userId, model);
    if (!agent) return { ok: false, error: problem };
    try {
      const { edits, usage } = await input.run(agent);
      return { ok: true, edits, usage, modelId: model.id, modelLabel: model.label };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : `${model.label} failed`,
      };
    }
  }

  // --- Credits path --------------------------------------------------------
  const ref = `${input.projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  // Free-token wallet first: while the wallet covers the run's token price,
  // the wallet pays and no credits are debited. A wallet that only part-covers
  // the run is left untouched — draining it here would burn free tokens on a
  // run that credits (or the free fallback model) end up paying for anyway.
  // ensureFreeWallet grants the sign-up allowance on first use, so the free
  // tokens exist even if the user never opened a page that created the wallet.
  if (input.useFreeTokens !== false) {
    const wallet = await ensureFreeWallet(input.userId);
    const need = model.cost * FREE_TOKENS_PER_CREDIT;
    if (wallet.balance >= need) {
      const { agent } = await resolveAgent(input.userId, model);
      if (!agent) return { ok: false, error: "Model unavailable." };
      try {
        const { edits, usage } = await input.run(agent);
        // Spend what the run actually used, capped at the wallet's coverage
        // for this prompt (never overdraw, never a zero-token no-op).
        const used = Math.max(1, Math.min(need, usage?.totalTokens ?? need));
        const left = await spendFreeTokens(input.userId, used, `${ref}:free`, model.label);
        if (left !== null) {
          return {
            ok: true,
            edits,
            usage,
            modelId: model.id,
            modelLabel: model.label,
            freeTokensUsed: used,
            freeTokensLeft: left,
            freeExhausted: left <= 0,
          };
        }
        // The wallet shrank between the check and the spend (a concurrent run
        // got there first), so the spend was refused. The work is already
        // delivered, so bill credits for it — the ref keeps this idempotent —
        // and never report the wallet as exhausted off a refused spend.
        const charged = await debitForRun({
          userId: input.userId,
          cost: model.cost,
          ref,
          note: model.label,
        });
        if (charged) {
          return {
            ok: true,
            edits,
            usage,
            modelId: model.id,
            modelLabel: model.label,
            creditsSpent: model.cost,
          };
        }
        return {
          ok: true,
          edits,
          usage,
          modelId: model.id,
          modelLabel: model.label,
          notice: `Your free tokens ran out mid-run, so this one went through free. Buy credits to keep using ${model.label}.`,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : `${model.label} failed`,
        };
      }
    }
  }

  const debited = await debitForRun({
    userId: input.userId,
    cost: model.cost,
    ref,
    note: model.label,
  });

  if (!debited) {
    const fb = getModel(FREE_FALLBACK_ID)!;
    const { agent } = await resolveAgent(input.userId, fb);
    if (!agent) {
      return {
        ok: false,
        error:
          "Out of credits — buy more in Settings. (Free fallback also needs an opencode key configured; add one and you're unblockable.)",
      };
    }
    try {
      const { edits, usage } = await input.run(agent);
      return {
        ok: true,
        edits,
        usage,
        modelId: fb.id,
        modelLabel: fb.label,
        usedFallback: true,
        notice: `You're out of credits, so this ran on ${fb.label} (free). Buy credits in Settings to use ${model.label} again.`,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Out of credits, and the free fallback failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      };
    }
  }

  const { agent } = await resolveAgent(input.userId, model);
  if (!agent) {
    await refundRun({ userId: input.userId, cost: model.cost, ref });
    return { ok: false, error: "Model unavailable — credits refunded." };
  }

  try {
    const { edits, usage } = await input.run(agent);
    return {
      ok: true,
      edits,
      usage,
      modelId: model.id,
      modelLabel: model.label,
      creditsSpent: model.cost,
    };
  } catch (err) {
    await refundRun({ userId: input.userId, cost: model.cost, ref });
    return {
      ok: false,
      error: `${model.label} failed — your ${model.cost} credit${model.cost === 1 ? "" : "s"} were refunded. ${
        err instanceof Error ? err.message : ""
      }`,
    };
  }
}
