import { db } from "./db";
import { getModel, DEFAULT_MODEL_ID, FREE_FALLBACK_ID, type ModelDef } from "./models";
import { debitForRun, refundRun } from "./credits";
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
  modelId?: string;
  modelLabel?: string;
  usedFallback?: boolean;
  creditsSpent?: number;
  notice?: string;
}

async function keyFor(userId: string, provider: string): Promise<string | null> {
  const row = await db.userKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  return row?.key ?? null;
}

function platformConfig(m: ModelDef): LlmConfig | null {
  // Platform-hosted (credits) models use VIBECODER_<PROVIDER>_API_KEY env.
  const envKey =
    m.provider === "anthropic"
      ? process.env.VIBECODER_ANTHROPIC_API_KEY
      : m.provider === "openai"
        ? process.env.VIBECODER_OPENAI_API_KEY
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
  if (model.tier === "free" || model.byok) {
    const key = await keyFor(userId, model.provider);
    if (!key) {
      return {
        agent: null,
        problem: `${model.label} needs a free ${model.provider} API key — add it in Settings (it takes a minute).`,
      };
    }
    return {
      agent: new LlmAgent({
        apiKey: key,
        baseUrl: PROVIDER_BASE_URL[model.provider],
        model: model.model,
      }),
    };
  }

  // Credits tier: platform key required; if we don't have one configured,
  // degrade to the mock so the product still works end to end.
  const cfg = platformConfig(model);
  if (!cfg) return { agent: new MockAgent() };
  return { agent: new LlmAgent(cfg) };
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
  run: (agent: Agent) => Promise<import("./agent/types").FileEdit[]>;
}): Promise<RunOutcome> {
  const requested = input.modelId ? getModel(input.modelId) : null;
  const model = requested ?? getModel(DEFAULT_MODEL_ID)!;

  // --- Free / BYO path -----------------------------------------------------
  if (model.tier === "free") {
    const { agent, problem } = await resolveAgent(input.userId, model);
    if (!agent) return { ok: false, error: problem };
    try {
      const edits = await input.run(agent);
      return { ok: true, edits, modelId: model.id, modelLabel: model.label };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : `${model.label} failed`,
      };
    }
  }

  // --- Credits path --------------------------------------------------------
  const ref = `${input.projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const debited = await debitForRun({
    userId: input.userId,
    cost: model.cost,
    ref,
    note: model.label,
  });

  if (!debited) {
    const fb = getModel(FREE_FALLBACK_ID)!;
    const { agent, problem } = await resolveAgent(input.userId, fb);
    if (!agent) {
      return {
        ok: false,
        error:
          "Out of credits — buy more in Settings. (Free fallback also needs a free Zen key; add one and you're unblockable.)",
      };
    }
    try {
      const edits = await input.run(agent);
      return {
        ok: true,
        edits,
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
    const edits = await input.run(agent);
    return {
      ok: true,
      edits,
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
