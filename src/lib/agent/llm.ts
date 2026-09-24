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
  /** Hard ceiling on completion tokens for one agent run. */
  maxOutputTokens?: number;
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

// One agent run has two budgets, both env-overridable for ops and testing.
//
// Output: providers otherwise pick their own ceiling, and a reasoning model
// spends part of whatever it is given on hidden reasoning tokens (measured:
// 425 of 784 completion tokens for a one-file website), so an unbounded run is
// both slow and unbounded in cost. The default is deliberately above the
// working floor — too low a cap returns empty content, not an error.
//
// Input: the whole project is re-sent on every turn, so its size is what decides
// what a run costs. Every file is always sent — an agent that cannot see a file
// cannot edit it correctly, and dropping files trades a token saving for silent
// wrong answers — but each file goes out compacted.
export const DEFAULT_MAX_OUTPUT_TOKENS = 2500;

/** Cap on how many files one reply may rewrite — more than this is not a diff
 *  anyone reviews. */
export const MAX_EDITS_PER_RUN = 12;

function positiveEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Effective completion-token ceiling: config first, then env, then default. */
export function outputTokenBudget(config: Pick<LlmConfig, "maxOutputTokens">): number {
  return config.maxOutputTokens ?? positiveEnv("VIBECODER_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS);
}

/** Which files may be compacted. Code and CSS carry whole-line comments worth
 *  dropping; JSON and HTML do not, and rewriting their bytes buys nothing. */
const COMPACTABLE = /\.(?:[cm]?[jt]sx?|css)$/i;

/**
 * Strip whole-line comments, blank lines and trailing whitespace. Only comments
 * that occupy a line of their own are removed — never an inline comment — so a
 * line-comment marker inside a string, a JSX comment child, or a URL survives
 * untouched.
 *
 * This changes the bytes, which is why the edit matcher compares against the
 * compacted view (see normalizeForMatch) and still records the real file as
 * `before`, so /undo restores the original.
 */
export function compactSource(text: string, path: string): string {
  if (!COMPACTABLE.test(path)) return text;
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (inBlock) {
      const end = trimmed.indexOf("*/");
      if (end === -1) continue;
      inBlock = false;
      const rest = line.slice(line.indexOf("*/") + 2).trimEnd();
      if (rest.trim()) out.push(rest);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/", 2);
      if (end === -1) {
        inBlock = true;
        continue;
      }
      const rest = trimmed.slice(end + 2).trim();
      if (rest) out.push(rest);
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    out.push(line.trimEnd());
  }
  return out.join("\n");
}

/**
 * How much a file matters to this prompt. Files the prompt names outrank
 * everything; the render path (`index.html`, anything under `src/`) outranks the
 * build config, which is almost never what a "build me a website" ask rewrites.
 * This decides reading order only — every file is included either way.
 */
function relevance(path: string, prompt: string): number {
  const base = path.slice(path.lastIndexOf("/") + 1);
  let score = 0;
  if (prompt.includes(path) || (base.length > 2 && prompt.includes(base))) score += 4;
  if (path === "index.html" || path.startsWith("src/")) score += 2;
  if (path === "package.json" || path === "tsconfig.json" || path.startsWith("vite.config")) score -= 1;
  return score;
}

/**
 * The whole app in context: every file, always, each one compacted. Ordering
 * puts the files the prompt names first, then the render path, so the model
 * reads what matters before the build config.
 */
function buildFileList(files: Files, prompt: string): string {
  return Object.keys(files)
    .sort((a, b) => relevance(b, prompt) - relevance(a, prompt) || a.localeCompare(b))
    .map((path) => `\n--- ${path} ---\n${compactSource(files[path], path)}`)
    .join("");
}

/**
 * Tolerant comparison for the `before` a model echoes back. The prompt carried a
 * compacted view, and a model may also retab or re-indent, so a whitespace-only
 * difference must not throw away an otherwise correct edit.
 */
function normalizeForMatch(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
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
    const decoded: unknown = JSON.parse(trimmed);
    const parsed = (Array.isArray(decoded) ? decoded[0] : decoded) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    } | null;
    const nested = parsed?.error;
    const message = typeof nested === "string" ? nested : nested?.message ?? parsed?.message;
    if (typeof message === "string") return message.replace(/\s+/g, " ").slice(0, 300);
  } catch {
    // An HTML or plain-text error page from a proxy — fall through to a snippet.
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 200);
}

/** The one thing the reader can do about this status. */
export function fixHintFor(status: number, config: Pick<LlmConfig, "providerLabel" | "keyEnv" | "modelId" | "baseUrl">): string {
  const who = config.providerLabel ?? "the provider";
  const env = config.keyEnv?.length ? config.keyEnv.join(" or ") : "the provider's API key variable";
  if (status === 401 || status === 403) {
    return `${who} did not accept the key. Add a working ${who} key in ${SETTINGS_HINT}, or set ${env} in the environment.`;
  }
  if (status === 400) {
    return `${who} rejected the request format or model parameters. Check the selected model and request settings.`;
  }
  if (status === 402) {
    return `${who} requires billing or account access for this request. Check the provider account; creating another key does not add quota.`;
  }
  if (status === 404) {
    return `${who} does not serve this model id. Set ${envNameFor(config.modelId)} to the id from ${who}'s console — no deploy needed.`;
  }
  if (status === 429) {
    return `${who} is rate limiting this key or its free quota is spent — wait a moment and retry.`;
  }
  if (status >= 500) {
    return `${who} is temporarily busy or unavailable. Please try again shortly; this response does not indicate a bad API key.`;
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

// Bound the whole provider attempt, including response bodies and backoff.
// Only explicit transient HTTP failures are replayed; timeouts/network failures
// may have executed upstream already, so leave those to the free fallback.
const REQUEST_BUDGET_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function retryWait(header: string | null, attempt: number): number {
  const backoff = 500 * 2 ** attempt + Math.random() * 250;
  if (!header) return backoff;
  const seconds = Number(header);
  const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(wait) ? Math.max(backoff, wait) : backoff;
}

async function requestCompletion(config: LlmConfig, body: string): Promise<unknown> {
  const deadline = Date.now() + REQUEST_BUDGET_MS;
  const who = config.providerLabel ?? "The provider";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    let failure: Error;
    let status: number;
    let delay: number;
    try {
      const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body,
        signal: controller.signal,
      });
      if (res.ok) return await res.json();
      status = res.status;
      failure = await httpError(res, config);
      delay = retryWait(res.headers?.get("retry-after") ?? null, attempt);
    } catch {
      if (controller.signal.aborted) {
        throw new Error(`${who} timed out. Please try again shortly.`);
      }
      throw new Error(`${who} could not complete the response. Please try again shortly.`);
    } finally {
      clearTimeout(timer);
    }
    // Do not hammer a provider whose Retry-After exceeds this request's budget.
    if (!RETRYABLE.has(status) || attempt === MAX_ATTEMPTS - 1 ||
        delay > MAX_RETRY_WAIT_MS || Date.now() + delay >= deadline) throw failure;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(`${who} is temporarily unavailable.`);
}

export class LlmAgent implements Agent {
  constructor(private config: LlmConfig) {}

  async run(prompt: string, files: Files): Promise<AgentResult> {
    const fileList = buildFileList(files, prompt);
    const userMessage = `Project files:${fileList || "\n(empty project)\n"}\n\nUser prompt: ${prompt}`;

    const cap = outputTokenBudget(this.config);
    const data = (await requestCompletion(this.config, JSON.stringify({
      model: this.config.model,
      max_tokens: cap,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }))) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const choice = data.choices?.[0];
    const reply = choice?.message?.content ?? "";
    // "length" means the provider stopped at max_tokens, not that it finished.
    // A reasoning model can spend the whole budget before emitting any content,
    // which looks identical to a broken provider unless it is named here.
    const truncated = choice?.finish_reason === "length";
    if (!reply.trim()) {
      throw new Error(
        truncated
          ? `The model used its entire ${cap}-token output budget before writing anything (hidden reasoning tokens count toward it). Raise VIBECODER_MAX_OUTPUT_TOKENS, or ask for a smaller change.`
          : "agent API returned empty content",
      );
    }
    let parsed: FileEdit[];
    try {
      parsed = parseEditsReply(reply);
    } catch (err) {
      if (truncated) {
        throw new Error(
          `The model hit the ${cap}-token output budget mid-reply, so its JSON was cut off. Raise VIBECODER_MAX_OUTPUT_TOKENS, or ask for a smaller change.`,
        );
      }
      throw err;
    }
    // The model saw the compacted view, so match against that — but record the
    // real file content as `before`, so a revert restores the original bytes.
    const matched = parsed
      .map((edit) => ({ edit, raw: files[edit.path] ?? "" }))
      .filter(({ edit, raw }) => {
        if (!(edit.path in files)) return edit.before === "";
        return normalizeForMatch(edit.before) === normalizeForMatch(compactSource(raw, edit.path));
      })
      .filter(({ edit, raw }) => edit.after !== compactSource(raw, edit.path));
    if (matched.length === 0) {
      throw new Error("The model returned no usable changes. Please try a more specific request.");
    }
    const edits = matched
      .slice(0, MAX_EDITS_PER_RUN)
      .map(({ edit, raw }) => ({ ...edit, before: raw }));
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