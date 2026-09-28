import type { SkillDefinition, SkillSummary } from "./skills";

export interface FileEdit {
  path: string;
  /** Full current content of the file; empty string for a new file. */
  before: string;
  /** Full new content of the file. */
  after: string;
}

export type Files = Record<string, string>;

/** Token accounting for one agent run, when the provider reports it. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface AgentResult {
  edits: FileEdit[];
  /** The agent's natural-language answer to show in the chat thread. */
  reply?: string;
  usage?: TokenUsage;
  plan?: string;
  suggestions?: string[];
  skillIds?: string[];
}

export interface AgentRunContext {
  approvedPlan?: string;
  answer?: string;
  skills?: SkillDefinition[];
  /** Normalized multimodal inputs. Transport-agnostic: LlmAgent translates
   *  these to provider blocks, MockAgent handles them deterministically. */
  attachments?: AgentAttachment[];
}

/** Normalized attachment payload. No raw upload bytes beyond data URLs the
 *  model can consume: images/frames as data URLs, documents as text. */
export type AgentAttachment =
  | { kind: "image"; name: string; mimeType: string; imageUrl: string; detail: "auto" | "low"; width?: number; height?: number }
  | { kind: "videoFrames"; name: string; mimeType: string; frames: { timestampMs: number; imageUrl: string; detail: "low" }[] }
  | { kind: "document"; name: string; mimeType: string; extractedText: string; truncated: boolean };

/** Normalized request for an agent turn (what POST .../agent accepts). */
export interface AgentRequest {
  projectId: string;
  userText: string;
  attachments: AgentAttachment[];
  files: Files;
  modelId?: string;
}

/** Normalized result: existing agent fields plus explicit outcome. */
export interface AgentRunResult extends AgentResult {
  changedPaths: string[];
  success: boolean;
}

/** Derive the normalized result shape from any agent result. */
export function toRunResult(result: AgentResult): AgentRunResult {
  return {
    ...result,
    changedPaths: result.edits.map((e) => e.path),
    success: true,
  };
}

export interface AgentPlanOptions {
  skills: SkillSummary[];
  pinnedSkillIds?: string[];
}

export interface Agent {
  /** Turn one prompt into a proposed set of file edits. Never mutates state. */
  run(prompt: string, files: Files, context?: AgentRunContext): Promise<AgentResult>;
  plan(prompt: string, files: Files, options: AgentPlanOptions): Promise<AgentResult>;
}

export function looksLikeJsx(path: string): boolean {
  return /\.(tsx|jsx)$/.test(path);
}
