// Model registry — single source of truth for the picker, the engine, and
// pricing. Platform-hosted models are billed in credits (1 credit = $0.10)
// at ~2× our raw provider cost: the 50% platform margin. BYO-key models are
// free to run — the user pays the provider directly.

export type Tier = "free" | "credits";
export type ProviderId = "vibecoder" | "opencode" | "google" | "groq" | "openrouter" | "nvidia" | "anthropic" | "openai";




export interface ModelDef {
  id: string; // stable id used in the API
  label: string;
  provider: ProviderId;
  tier: Tier;
  /** Credits per prompt (tier: credits only). Already includes the 50% margin. */
  cost: number;
  /** OpenAI-compatible model string sent to the provider. */
  model: string;
  /** Whether the user must supply their own API key for this provider. */
  byok: boolean;
  /** Context window in tokens (for the session context meter). */
  contextLimit: number;
  note: string;
}

// Nothing from OpenCode Zen's free tier belongs here. Its models are gated at
// the provider: called from anywhere but the OpenCode app itself they answer
//   403 FreeTierError: "OpenCode's free tier can only be used from within OpenCode"
// (verified against a valid Zen key — the *paid* Zen models do work from a
// server, they just need funds, so Zen stays available for the credits tier).
// Free models must therefore come from providers that allow server use.
export const MODELS: ModelDef[] = [
  
  {
  id: "groq-gpt-oss",
  label: "GPT-OSS 120B",
  provider: "groq",
  tier: "free",
  cost: 0,
  model: "openai/gpt-oss-120b",
  byok: true,
  contextLimit: 131072,
  note: "Available on Groq's free plan, subject to account and token limits.",
},
  {
    id: "openrouter-free",
    label: "OpenRouter Free",
    provider: "openrouter",
    tier: "free",
    cost: 0,
    // The ``free`` alias auto-routes to whichever free model is actually
    // serving, which is more robust than pinning an id that rotates. Checked
    // against openrouter.ai: /models lists 24 zero-priced models, and the free
    // tier is a hard 50 requests/day per key — so this sits behind Groq in
    // FREE_PREFERENCE and never in front of it.
    model: "openrouter/free",
    byok: true,
    contextLimit: 200000,
    note: "OpenRouter's free route — 50 requests/day per key, shared by every user of that key.",
  },
  {
    id: "nemotron",
    label: "Nemotron (NVIDIA)",
    provider: "nvidia",
    tier: "free",
    cost: 0,
    // NVIDIA NIM trial endpoint: free OpenAI-compatible API at build.nvidia.com.
    // Key is free; limits are per-account trial terms.
    model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    byok: true,
    contextLimit: 128000,
    note: "Free via NVIDIA NIM (build.nvidia.com), subject to NVIDIA trial limits.",
  },
{
    id: "gemini-flash",
    label: "Gemini Flash",
    provider: "google",
    tier: "free",
    cost: 0,
    // Verified against ai.google.dev (gemini-api/docs/openai gives the base URL
    // and this model id; gemini-api/docs/rate-limits defines the Free usage tier
    // as RPM/TPM/RPD quotas per project, RPD resetting at midnight Pacific).
    // Kept in the registry as the last free fallback: its free tier is the
    // strongest free coder, but it answered 503 UNAVAILABLE under load, so it
    // must not be what a first prompt waits on.
    model: "gemini-3.8-flash",
    byok: true,
    contextLimit: 1000000,
    note: "Google's free tier (quota-limited): key from Google AI Studio, or served by the platform.",
  },
  // {
  //   id: "glm-flash",
  //   label: "GLM Flash",
  //   provider: "zai",
  //   tier: "free",
  //   cost: 0,
  //   // Verified against docs.z.ai (api-reference/llm/chat-completion lists the
  //   // model enum; guides/overview/pricing lists GLM-4.7-Flash at $0 for input,
  //   // cached input and output). glm-4.5-flash and glm-4.6v-flash are also $0.
  //   // "glm-4.7-flashx" is the paid sibling — do not confuse the two.
  //   model: "glm-4.7-flash",
  //   byok: true,
  //   contextLimit: 200000,
  //   note: "Z.ai's free tier: GLM-4.7-Flash is priced at $0. Key from z.ai, or served by the platform.",
  // },
  {
    id: "sonnet",
    label: "Claude Sonnet",
    provider: "anthropic",
    tier: "credits",
    cost: 8, // ≈ $0.80/prompt raw · billed 8 credits (50% margin)
    model: "claude-sonnet-4-5",
    byok: false,
    contextLimit: 200000,
    note: "Best for whole features. Billed from credits.",
  },
  {
    id: "haiku",
    label: "Claude Haiku",
    provider: "anthropic",
    tier: "credits",
    cost: 1, // ≈ $0.05–0.10/prompt raw · billed 1 credit
    model: "claude-haiku-4-5",
    byok: false,
    contextLimit: 200000,
    note: "Fast small edits. Billed from credits.",
  },
  {
    id: "gpt",
    label: "GPT (OpenAI)",
    provider: "openai",
    tier: "credits",
    cost: 4, // ≈ $0.40/prompt raw · billed 4 credits
    model: "gpt-4o",
    byok: false,
    contextLimit: 200000,
    note: "Balanced quality. Billed from credits.",
  },
  {
    id: "openrouter-paid",
    label: "OpenRouter (BYOK)",
    provider: "openrouter",
    tier: "credits",
    cost: 0, // user pays provider directly
    model: "openrouter/auto",
    byok: true,
    contextLimit: 200000,
    note: "Use your OpenRouter key to access any model. You're billed by OpenRouter directly.",
  },
];

export function getModel(id: string): ModelDef | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

// OpenRouter Free is the default for now: Groq's free tier has been less
// reliable in practice (rate limits), so the more robust ``openrouter/free``
// alias leads the free chain. FREE_PREFERENCE below keeps the same order.
export const DEFAULT_MODEL_ID = "openrouter-free";

/**
 * Free models in preference order. Groq answers first: it returned a one-file
 * website in ~2s in testing, while Gemini's default id was answering 503
 * UNAVAILABLE. Gemini stays in the chain — its free tier is the strongest free
 * coder when it is up — but it is tried last, so a flaky upstream costs the user
 * a wait only after the healthy providers have both refused. OpenRouter sits in
 * the middle and is capped at 50 free requests/day per key.
 */
const FREE_PREFERENCE = ["openrouter-free", "groq-gpt-oss", "nemotron", "gemini-flash"];

export function freeModels(): ModelDef[] {
  const rank = (m: ModelDef) => {
    const i = FREE_PREFERENCE.indexOf(m.id);
    return i === -1 ? FREE_PREFERENCE.length : i;
  };
  return MODELS.filter((m) => m.tier === "free").sort((a, b) => rank(a) - rank(b));
}

/** Provider metadata for the picker UI (icon letter handles the logo for now). */
export const PROVIDER_META: Record<ProviderId, { label: string; blurb: string }> = {
  groq: { label: "Groq", blurb: "Free plan with usage limits" },
  openrouter: { label: "OpenRouter", blurb: "Selected free models with usage limits" },
  nvidia: { label: "NVIDIA NIM", blurb: "Nemotron models, free trial endpoint" },
  vibecoder: { label: "Vibecoder Hosted", blurb: "Pay with credits" },
  opencode: { label: "OpenCode Zen", blurb: "Paid Zen models (its free tier is app-only)" },
  // zai: { label: "Z.ai", blurb: "Free GLM Flash" },
  google: { label: "Google", blurb: "Free Gemini tier" },
  anthropic: { label: "Anthropic", blurb: "Hosted — billed in credits" },
  openai: { label: "OpenAI", blurb: "Hosted — billed in credits" },
};

/**
 * Providers a user can bring their own key for — every provider the registry
 * knows except our own hosted tier. The keys endpoint validates against this,
 * so any provider that shows up in the picker can actually be configured: the
 * hand-written list it replaced had drifted out of sync and rejected Google
 * keys while the registry shipped a free Gemini model.
 */
export const BYO_PROVIDERS: ProviderId[] = (Object.keys(PROVIDER_META) as ProviderId[]).filter(
  (p) => p !== "vibecoder",
);

/** Fallback chain when a paid run can't be billed: → free default. */
export const FREE_FALLBACK_ID = "openrouter-free";
