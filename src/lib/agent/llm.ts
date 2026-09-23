import type { Agent, AgentResult, FileEdit, Files } from "./types";
import { isValidProjectPath, sanitizePath } from "./paths";

const SYSTEM_PROMPT = `You are the Vibecoder coding agent. You edit files in a
user's React project. Respond with ONLY a JSON object of the form:
{"edits":[{"path":"src/App.tsx","before":"<exact current full file content>","after":"<exact new full file content>"}]}
Rules:
- "before" must be byte-identical to the current content passed to you (empty string for a new file).
- "after" is the complete new file content, never a patch or partial diff.
- Only edit files that exist in the project (or clearly new files the user asked to create).
- Relative repo paths only.`;

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Human name of the provider ("Z.ai"), so failures can name who refused. */
  providerLabel?: string;
  /** Env vars the platform can hold this provider's key in — quoted back to the
   *  operator in errors, because "key missing" is useless without a variable name. */
  keyEnv?: string[];
  /** Registry id ("glm-flash"), so a rejected model id can be re-pointed. */
  modelId?: string;
}

export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const apiKey = env.AGENT_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.AGENT_BASE_URL ?? "https://api.openai.com/v1",
    model: env.AGENT_MODEL ?? "gpt-4o-mini",
  };
}

// A bare "responded 403" names neither who refused nor what to do about it.
// Providers explain themselves in the body, and the same status means very
// different things (bad key vs no funds vs a model that is not allowed outside
// the vendor's own app), so the error has to carry the status, the provider's
// own words, and the one action that fixes it.
const SETTINGS_HINT = "Settings → API keys";

function envNameFor(modelId: string | undefined): string {
  const suffix = (modelId ?? "MODEL").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `VIBECODER_MODEL_${suffix}`;
}

export function providerErrorText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const nested = parsed.error;
    const message = typeof nested === "string" ? nested : nested?.message ?? parsed.message;
    if (message) return message;
  } catch {
    // An HTML or plain-text error page from a proxy — fall through to a snippet.
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 200);
}

/** The one thing the reader can do about this status. */
export function fixHintFor(status: number, config: Pick<LlmConfig, "providerLabel" | "keyEnv" | "modelId" | "baseUrl">): string {
  const who = config.providerLabel ?? "the provider";
  const env = config.keyEnv?.length ? config.keyEnv.join(" or ") : "the provider's API key variable";
  if (status === 400 || status === 401 || status === 403) {
    return `${who} did not accept the key. Add a working ${who} key in ${SETTINGS_HINT}, or set ${env} in the environment.`;
  }
  if (status === 402) {
    return `${who} says the account has no funds. ${who}'s free models cost nothing — this request went to a paid model, or the key belongs to an unfunded account.`;
  }
  if (status === 404) {
    return `${who} does not serve this model id. Set ${envNameFor(config.modelId)} to the id from ${who}'s console — no deploy needed.`;
  }
  if (status === 429) {
    return `${who} is rate limiting this key or its free quota is spent — wait a moment and retry.`;
  }
  return `Check the ${who} key in ${SETTINGS_HINT} (or ${env}) and that ${config.baseUrl} is reachable.`;
}

/**
 * One sentence a refusal has to carry, wherever it is reported: who refused,
 * what they said, and the single action that fixes it. Shared by the agent
 * run and the readiness check so the picker and a failed prompt cannot
 * describe the same rejection in two different ways.
 */
export function refusalMessage(
  status: number,
  detail: string,
  config: Pick<LlmConfig, "providerLabel" | "keyEnv" | "modelId" | "baseUrl">,
): string {
  const who = config.providerLabel ?? "the provider";
  const what = config.modelId ? `the "${config.modelId}" model` : "this model";
  return `${who} refused ${what} — HTTP ${status}${detail ? `, provider said: "${detail}"` : ""}. ${fixHintFor(status, config)}`;
}

async function httpError(res: Response, config: LlmConfig): Promise<Error> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }
  return new Error(refusalMessage(res.status, providerErrorText(body), config));
}

function parseEditsReply(reply: string): FileEdit[] {
  const text = reply
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let data: { edits?: unknown };
  try {
    data = JSON.parse(text) as { edits?: unknown };
  } catch {
    throw new Error("agent reply was not valid JSON");
  }
  if (!Array.isArray(data.edits)) throw new Error("agent reply missing edits array");

  const edits: FileEdit[] = [];
  for (const raw of data.edits as unknown[]) {
    const e = raw as FileEdit;
    if (typeof e?.path !== "string" || typeof e.before !== "string" || typeof e.after !== "string") {
      throw new Error("edit entry malformed");
    }
    const path = sanitizePath(e.path);
    if (!isValidProjectPath(path)) throw new Error(`edit path rejected by sandbox: ${path}`);
    if (e.after === e.before) continue;
    edits.push({ ...e, path });
  }
  return edits;
}

export class LlmAgent implements Agent {
  constructor(private config: LlmConfig) {}

  async run(prompt: string, files: Files): Promise<AgentResult> {
    const fileList = Object.keys(files)
      .map((p) => `\n--- ${p} ---\n${files[p]}`)
      .join("");
    const userMessage = `Project files:${fileList || "\n(empty project)\n"}\n\nUser prompt: ${prompt}`;

    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw await httpError(res, this.config);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const reply = data.choices?.[0]?.message?.content ?? "";
    if (!reply.trim()) throw new Error("agent API returned empty content");
    const edits = parseEditsReply(reply);
    const usage = data.usage?.total_tokens
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
          reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
          cacheReadTokens: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : undefined;
    return { edits, usage };
  }
}