import type { Agent } from "./types";
import { MockAgent } from "./mock";
import { LlmAgent, llmConfigFromEnv } from "./llm";

/** Real model when AGENT_API_KEY is set, deterministic mock otherwise. */
export function makeAgent(env: NodeJS.ProcessEnv = process.env): Agent {
  const config = llmConfigFromEnv(env);
  return config ? new LlmAgent(config) : new MockAgent();
}