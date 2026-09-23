// Model registry — single source of truth for the picker, the engine, and
// pricing. Platform-hosted models are billed in credits (1 credit = $0.10)
// at ~2× our raw provider cost: the 50% platform margin. BYO-key models are
// free to run — the user pays the provider directly.

export type Tier = "free" | "credits";
export type ProviderId = "vibecoder" | "opencode" | "zai" | "anthropic" | "openai";

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
  note: string;
}

export const MODELS: ModelDef[] = [
  {
    id: "big-pickle",
    label: "Big Pickle",
    provider: "opencode",
    tier: "free",
    cost: 0,
    model: "big-pickle",
    byok: true,
    note: "OpenCode Zen free stealth model — bring a free Zen key.",
  },
  {
    id: "grok-code",
    label: "Grok Code",
    provider: "opencode",
    tier: "free",
    cost: 0,
    model: "grok-code",
    byok: true,
    note: "Free Zen model for quick edits.",
  },
  {
    id: "glm-flash",
    label: "GLM Flash",
    provider: "zai",
    tier: "free",
    cost: 0,
    model: "glm-4.5-flash",
    byok: true,
    note: "Z.ai free flash model — bring a free Z.ai key.",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet",
    provider: "anthropic",
    tier: "credits",
    cost: 8, // ≈ $0.80/prompt raw · billed 8 credits (50% margin)
    model: "claude-sonnet-4-5",
    byok: false,
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
    note: "Balanced quality. Billed from credits.",
  },
];

export function getModel(id: string): ModelDef | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

export const DEFAULT_MODEL_ID = "big-pickle";

/** Provider metadata for the picker UI (icon letter handles the logo for now). */
export const PROVIDER_META: Record<ProviderId, { label: string; blurb: string }> = {
  vibecoder: { label: "Vibecoder Hosted", blurb: "Pay with credits" },
  opencode: { label: "OpenCode Zen", blurb: "Free models with a Zen key" },
  zai: { label: "Z.ai", blurb: "Free GLM Flash key" },
  anthropic: { label: "Anthropic", blurb: "Hosted — billed in credits" },
  openai: { label: "OpenAI", blurb: "Hosted — billed in credits" },
};

/** Fallback chain when a paid run can't be billed: → free default. */
export const FREE_FALLBACK_ID = "big-pickle";
