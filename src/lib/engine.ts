import { db } from "./db";
import {
  getModel,
  freeModels,
  DEFAULT_MODEL_ID,
  PROVIDER_META,
  type ModelDef,
} from "./models";

import { LlmAgent, type LlmConfig } from "./agent/llm";
import { MockAgent } from "./agent/mock";
import type { Agent } from "./agent/types";

// OpenAI-compatible endpoints per provider. Anthropic exposes an OpenAI-
// compatible surface at /v1; Z.ai, Cerebras and Hugging Face router are
// OpenAI-compatible too.
const PROVIDER_BASE_URL: Record<string, string> = {
  opencode: "https://opencode.ai/zen/v1",
  zai: "https://api.z.ai/api/paas/v4",
  cerebras: "https://api.cerebras.ai/v1",
  huggingface: "https://router.huggingface.co/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

// Env vars that can serve a provider, most specific first. The VIBECODER_ name
// is ours; the bare vendor name is accepted so a plain GEMINI_API_KEY in
// Vercel just works. Blank values count as unset — Vercel hands empty strings
// to the build when a var exists but has no value.
const PLATFORM_KEY_ENV: Record<string, string[]> = {
  anthropic: ["VIBECODER_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  openai: ["VIBECODER_OPENAI_API_KEY", "OPENAI_API_KEY"],
  opencode: ["VIBECODER_OPENCODE_API_KEY", "OPENCODE_API_KEY"],
  zai: ["VIBECODER_ZAI_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY"],
  cerebras: ["VIBECODER_CEREBRAS_API_KEY", "CEREBRAS_API_KEY"],
  huggingface: ["VIBECODER_HF_TOKEN", "HF_TOKEN", "HUGGINGFACE_API_KEY"],
  custom: ["VIBECODER_CUSTOM_API_KEY", "CUSTOM_API_KEY", "FREELLMAPI_API_KEY"],
  google: ["VIBECODER_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["VIBECODER_GROQ_API_KEY", "GROQ_KEY", "GROQ_API_KEY"],
  openrouter: ["VIBECODER_OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPENROUTER_API_KEY"],
  nvidia: ["VIBECODER_NVIDIA_API_KEY", "NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"],
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
  /** The agent's natural-language answer for the chat thread. */
  reply?: string;
  usage?: import("./agent/types").TokenUsage;
  plan?: string;
  suggestions?: string[];
  skillIds?: string[];
  modelId?: string;
  modelLabel?: string;
  /** Human provider name that actually served the run ("Groq") — the
   *  X-Routed-Via equivalent, so the chat can say who answered. */
  providerLabel?: string;
  /** Wall-clock ms for the serving provider attempt. */
  latencyMs?: number;
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

  // Unreachable now that every model is free/BYOK, but if a provider ever has
  // neither a user key nor a platform key it must fail honestly rather than
  // silently degrade to the mock.
  return {
    agent: null,
    problem: `${model.label} is not configured. Add a ${PROVIDER_META[model.provider].label} key in Settings → API keys.`,
  };
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
    const started = Date.now();
    try {
      const { edits, reply, usage, plan, suggestions, skillIds } = await run(agent);
      const swapped =
        candidate.id === requested.id
          ? ""
          : `${requested.label} was unavailable, so this ran on ${candidate.label} instead.`;

      return {
        ok: true,
        edits,
        reply,
        usage,
        plan,
        suggestions,
        skillIds,
        modelId: candidate.id,
        modelLabel: candidate.label,
        providerLabel: PROVIDER_META[candidate.provider].label,
        latencyMs: Date.now() - started,
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
 * Run one prompt through the requested model, free of charge. There are no
 * credit plans: the run walks the key-based free chain (user key → platform
 * key → next preferred model), so a provider that is down or unconfigured
 * falls through instead of dead-ending.
 */
export async function runModelPrompt(input: {
  userId: string;
  projectId: string;
  modelId: string | undefined;
  prompt: string;
  files: Record<string, string>;
  useFreeTokens?: boolean;
  /** Test seam: "mock" runs MockAgent with no keys, no debits, no network.
   *  Never offered in UI; the agent route only honors it when explicitly
   *  enabled server-side. */
  agentKind?: "auto" | "mock";
  run: (agent: Agent) => Promise<import("./agent/types").AgentResult>;
}): Promise<RunOutcome> {
  if (input.agentKind === "mock") {
    const started = Date.now();
    try {
      const { edits, reply, usage, plan, suggestions, skillIds } = await input.run(new MockAgent());
      return {
        ok: true,
        edits,
        reply,
        usage,
        plan,
        suggestions,
        skillIds,
        modelId: "mock",
        modelLabel: "Mock Agent",
        providerLabel: "Mock",
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Mock agent failed" };
    }
  }
  const requested = input.modelId ? getModel(input.modelId) : null;
  const model = requested ?? getModel(DEFAULT_MODEL_ID)!;

  // Every model is free-tier now (no credit plans, no wallet, no billing).
  try {
    return await runFreeAnswer(input.userId, model, input.run);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `${model.label} failed`,
    };
  }
}
