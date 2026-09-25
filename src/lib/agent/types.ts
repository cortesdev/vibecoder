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
