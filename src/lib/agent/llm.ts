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

// A bare "responded 403" hides the only useful part of the answer. Providers
// explain themselves in the body, and the same status means very different
// things (bad key vs no funds vs "not allowed outside our app"), so surface it.
const STATUS_HINT: Record<number, string> = {
  401: "the provider rejected this API key",
  402: "the provider account is out of funds",
  403: "the provider refused this request — often a key or model that is not allowed outside the vendor's own app",
  404: "the provider does not know this model — check the model id",
  429: "rate limited by the provider — try again in a moment",
};

function providerErrorText(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string } | string; message?: string };
    const nested = parsed.error;
    const message = typeof nested === "string" ? nested : nested?.message ?? parsed.message;
    if (message) return message;
  } catch {
    // An HTML or plain-text error page from a proxy — fall through to a snippet.
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 200);
}

async function httpError(res: Response): Promise<Error> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }
  const detail = providerErrorText(body);
  const hint = STATUS_HINT[res.status];
  return new Error(
    `agent API responded ${res.status}${detail ? `: ${detail}` : ""}${hint ? ` (${hint})` : ""}`,
  );
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
    if (!res.ok) throw await httpError(res);

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