import { db } from "./db";
import {
  getModel,
  freeModels,
  DEFAULT_MODEL_ID,
  FREE_FALLBACK_ID,
  PROVIDER_META,
  type ModelDef,
} from "./models";
import { debitForRun, refundRun } from "./credits";
import { FREE_TOKENS_PER_CREDIT, ensureFreeWallet, spendFreeTokens } from "./freewallet";
import { freeCooldownMs, startFreeCooldown } from "./freecooldown";
import { LlmAgent, type LlmConfig } from "./agent/llm";
import { MockAgent } from "./agent/mock";
import type { Agent } from "./agent/types";

// OpenAI-compatible endpoints per provider. Anthropic exposes an OpenAI-
// compatible surface at /v1; Z.ai and OpenCode Zen are OpenAI-compatible too.
const PROVIDER_BASE_URL: Record<string, string> = {
  opencode: "https://opencode.ai/zen/v1",
  // Z.ai (GLM Flash) is commented out for now — restore here and in
  // PLATFORM_KEY_ENV when the free fallback chain needs it again.
  // zai: "https://api.z.ai/api/paas/v4",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

// Env vars that can serve a provider, most specific first. The VIBECODER_ name
// is ours; the bare vendor name is accepted so a plain GEMINI_API_KEY in
// Vercel just works. Blank values count as unset — Vercel hands empty strings
// to the build when a var exists but has no value.
const PLATFORM_KEY_ENV: Record<string, string[]> = {
  anthropic: ["VIBECODER_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  openai: ["VIBECODER_OPENAI_API_KEY", "OPENAI_API_KEY"],
  opencode: ["VIBECODER_OPENCODE_API_KEY", "OPENCODE_API_KEY"],
  // zai: ["VIBECODER_ZAI_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY"],
  google: ["VIBECODER_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["VIBECODER_GROQ_API_KEY", "GROQ_KEY", "GROQ_API_KEY"],
  openrouter: ["VIBECODER_OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPENROUTER_API_KEY"],
};

/** VIBECODER_MODEL_<MODEL_ID> overrides a model's provider string, so a
 *  renamed or rotated upstream id is an env change, not a deploy. */
function modelStringFor(m: ModelDef): string {
  const name = `VIBECODER_MODEL_${m.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  return process.env[name]?.trim() || m.model;
}

/** VIBECODER_BASE_URL_<PROVIDER> points a provider somewhere else — a corporate
 *  gateway, a metering proxy, or the local OpenAI-compatible stub the end-to-end
 *  test drives — without editing code. Same for every base URL below. */
function baseUrlFor(provider: string): string | undefined {
  const override = process.env[`VIBECODER_BASE_URL_${provider.toUpperCase()}`]?.trim();
  return override || PROVIDER_BASE_URL[provider];
}

/** Everything the error path needs to name the provider and the fix. */
function agentMeta(m: ModelDef) {
  return {
    providerLabel: PROVIDER_META[m.provider].label,
    keyEnv: PLATFORM_KEY_ENV[m.provider],
    modelId: m.id,
  };
}

/** "ZAI_API_KEY or VIBECODER_ZAI_API_KEY" — the names an operator can set. */
function keyEnvNames(m: ModelDef): string {
  return (PLATFORM_KEY_ENV[m.provider] ?? []).join(" or ");
}

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
  /** Milliseconds until a cooldown-gated free run is allowed again (ok: false). */
  cooldownMs?: number;
}

async function keyFor(userId: string, provider: string): Promise<string | null> {
  const row = await db.userKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  return row?.key ?? null;
}

function platformConfig(m: ModelDef): LlmConfig | null {
  const baseUrl = baseUrlFor(m.provider);
  if (!baseUrl) return null;
  // Blank or whitespace-only counts as unset: Vercel hands empty strings to the
  // build when a variable exists without a value, and that must not read as
  // "configured" — it produces a 401 nobody can explain from the UI.
  const apiKey = (PLATFORM_KEY_ENV[m.provider] ?? [])
    .map((name) => process.env[name]?.trim())
    .find(Boolean);
  if (!apiKey) return null;
  return { apiKey, baseUrl, model: modelStringFor(m), ...agentMeta(m) };
}

/** Where a model's request would go, and with whose key. */
export interface ProviderAccess extends LlmConfig {
  /** "user" when their own Settings key is used, "platform" for our env key. */
  source: "user" | "platform";
}

/**
 * The one resolution order for a model's provider access: the user's own BYO
 * key first, then the platform's env key. Both the agent run and the readiness
 * check go through here, so which key answers — and what is reported when none
 * can — is decided in exactly one place.
 */
export async function resolveProviderAccess(
  userId: string,
  model: ModelDef,
): Promise<
  | { kind: "access"; access: ProviderAccess }
  | { kind: "missing_key"; problem: string }
  | { kind: "unconfigured" }
> {
  // 1. The user's own BYO key wins when they've added one.
  if (model.byok) {
    const key = (await keyFor(userId, model.provider))?.trim();
    const baseUrl = baseUrlFor(model.provider);
    if (key && baseUrl) {
      return {
        kind: "access",
        access: {
          apiKey: key,
          baseUrl,
          model: modelStringFor(model),
          source: "user",
          ...agentMeta(model),
        },
      };
    }
  }

  // 2. Platform key fallback — lets online users run without adding a key of
  // their own when the platform provides one (e.g. ZAI_API_KEY).
  const cfg = platformConfig(model);
  if (cfg) return { kind: "access", access: { ...cfg, source: "platform" } };

  if (model.byok || model.tier === "free") {
    const who = PROVIDER_META[model.provider].label;
    return {
      kind: "missing_key",
      problem: `${model.label} needs a ${who} API key: add one in Settings → API keys, or set ${keyEnvNames(
        model,
      )} in the environment. An empty value counts as unset.`,
    };
  }

  return { kind: "unconfigured" };
}

async function resolveAgent(
  userId: string,
  model: ModelDef,
): Promise<{ agent: Agent | null; problem?: string }> {
  const resolved = await resolveProviderAccess(userId, model);
  // ProviderAccess is a LlmConfig plus where the key came from, so the agent
  // takes it as-is.
  if (resolved.kind === "access") return { agent: new LlmAgent(resolved.access) };
  if (resolved.kind === "missing_key") return { agent: null, problem: resolved.problem };

  // Credits tier with no platform key: degrade to the mock so the product
  // still works end to end.
  return { agent: new MockAgent() };
}

/**
 * Walk the free models starting with the one the user picked and run the first
 * one that actually answers — their own key, else the platform's. A free model
 * list is a menu, not a single point of failure: a provider that is 403/429/503
 * at runtime (free tiers get busy) falls through to the next free model, so the
 * first prompt answers whichever free provider is actually serving instead of
 * dead-ending on the first one that fails.
 */
type FreeRun = (agent: Agent) => Promise<import("./agent/types").AgentResult>;

async function runFreeAnswer(
  userId: string,
  requested: ModelDef,
  run: FreeRun,
  usedFallback = false,
): Promise<RunOutcome & { model: ModelDef; swapped: string }> {
  const chain = [requested, ...freeModels().filter((m) => m.id !== requested.id)];
  const failures: string[] = [];
  let attempted = false;
  for (const candidate of chain) {
    const { agent } = await resolveAgent(userId, candidate);
    if (!agent) {
      failures.push(`${candidate.label} (no key)`);
      continue;
    }
    attempted = true;
    try {
      const { edits, usage } = await run(agent);
      const swapped =
        candidate.id === requested.id
          ? ""
          : usedFallback
            ? `You're out of credits, so this ran on ${candidate.label} (free). Buy credits in Settings to use ${requested.label} again.`
            : `${requested.label} was unavailable, so this ran on ${candidate.label} instead (also free).`;
      // Only a completed free run starts the cooldown — a refusal that never
      // got an answer must not cost the user their next free turn.
      await startFreeCooldown(userId);
      return {
        ok: true,
        edits,
        usage,
        modelId: candidate.id,
        modelLabel: candidate.label,
        ...(usedFallback ? { usedFallback: true } : {}),
        notice: swapped || undefined,
        model: candidate,
        swapped,
      };
    } catch (err) {
      failures.push(`${candidate.label} (${err instanceof Error ? err.message : "failed"})`);
    }
  }
  const needs = chain
    .map((m) => `${m.label} → ${PROVIDER_META[m.provider].label} key in Settings → API keys, or set ${keyEnvNames(m)}`)
    .join("; ");
  return {
    ok: false,
    model: requested,
    swapped: "",
    error: attempted
      ? `No configured free model could complete your request. ${failures.join("; ")}. No app credits were charged.`
      : `No free provider is configured. Add a provider key in Settings → API keys, or configure the server: ${needs}. Availability depends on your provider account and quota.`,
  };
}

/**
 * Run one prompt through the requested model. Paid models debit credits
 * first (atomic); any failure refunds, and a drained wallet falls back to
 * the default free model so the user is never blocked.
 */
const FREE_COOLDOWN_HINT = "Free answers run on a shared quota, so there's a short wait between them.";

function cooldownMessage(ms: number): string {
  const secs = Math.ceil(ms / 1000);
  const when = secs >= 60 ? `${Math.ceil(secs / 60)} minute(s)` : `${secs} seconds`;
  return `A free answer was just used for this project — try again in ${when}. ${FREE_COOLDOWN_HINT}`;
}

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
    const cooldownMs = await freeCooldownMs(input.userId);
    if (cooldownMs > 0) return { ok: false, error: cooldownMessage(cooldownMs), cooldownMs };
    try {
      return await runFreeAnswer(input.userId, model, input.run);
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
    const fallback = getModel(FREE_FALLBACK_ID)!;
    try {
      return await runFreeAnswer(input.userId, fallback, input.run, true);
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
