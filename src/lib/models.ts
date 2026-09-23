// Model registry — single source of truth for the picker, the engine, and
// pricing. Platform-hosted models are billed in credits (1 credit = $0.10)
// at ~2× our raw provider cost: the 50% platform margin. BYO-key models are
// free to run — the user pays the provider directly.

export type Tier = "free" | "credits";
export type ProviderId = "vibecoder" | "opencode" | "zai" | "google" | "anthropic" | "openai";

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
    id: "glm-flash",
    label: "GLM Flash",
    provider: "zai",
    tier: "free",
    cost: 0,
    model: "glm-4.7-flash",
    byok: true,
    contextLimit: 200000,
    // Z.ai prices whole models at zero; glm-4.5-flash and glm-4.6v-flash are
    // free too. Override with VIBECODER_MODEL_GLM_FLASH if Z.ai rotates them.
    note: "Free on Z.ai — works right after sign-in, or bring your own Z.ai key.",
  },
  {
    id: "gemini-flash",
    label: "Gemini Flash",
    provider: "google",
    tier: "free",
    cost: 0,
    model: "gemini-3.8-flash",
    byok: true,
    contextLimit: 1000000,
    note: "Google's free tier — bring your own Gemini key, or use the platform's.",
  },
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
];

export function getModel(id: string): ModelDef | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

export const DEFAULT_MODEL_ID = "glm-flash";

/**
 * Free models in preference order, default first. The engine walks this so the
 * very first prompt runs on whichever free provider is actually reachable
 * (user's own key, else the platform's) instead of dead-ending on one of them.
 */
export function freeModels(): ModelDef[] {
  const free = MODELS.filter((m) => m.tier === "free");
  const preferred = free.find((m) => m.id === DEFAULT_MODEL_ID);
  return preferred ? [preferred, ...free.filter((m) => m !== preferred)] : free;
}

/** Provider metadata for the picker UI (icon letter handles the logo for now). */
export const PROVIDER_META: Record<ProviderId, { label: string; blurb: string }> = {
  vibecoder: { label: "Vibecoder Hosted", blurb: "Pay with credits" },
  opencode: { label: "OpenCode Zen", blurb: "Paid Zen models (its free tier is app-only)" },
  zai: { label: "Z.ai", blurb: "Free GLM Flash" },
  google: { label: "Google", blurb: "Free Gemini tier" },
  anthropic: { label: "Anthropic", blurb: "Hosted — billed in credits" },
  openai: { label: "OpenAI", blurb: "Hosted — billed in credits" },
};

/** Fallback chain when a paid run can't be billed: → free default. */
export const FREE_FALLBACK_ID = "glm-flash";
