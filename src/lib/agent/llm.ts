import type { Agent, FileEdit, Files } from "./types";
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

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env.AGENT_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.AGENT_BASE_URL ?? "https://api.openai.com/v1",
    model: env.AGENT_MODEL ?? "gpt-4o-mini",
  };
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

  async run(prompt: string, files: Files): Promise<FileEdit[]> {
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
    if (!res.ok) throw new Error(`agent API responded ${res.status}`);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content ?? "";
    if (!reply.trim()) throw new Error("agent API returned empty content");
    return parseEditsReply(reply);
  }
}