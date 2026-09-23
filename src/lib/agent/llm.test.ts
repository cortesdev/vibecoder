import { describe, expect, it, vi } from "vitest";
import { LlmAgent, llmConfigFromEnv } from "./llm";

function fetchReply(reply: string, usage?: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: reply } }],
      ...(usage ? { usage } : {}),
    }),
  });
}

describe("llmConfigFromEnv", () => {
  it("returns null without an API key", () => {
    expect(llmConfigFromEnv({})).toBeNull();
    expect(llmConfigFromEnv({ AGENT_BASE_URL: "https://x" })).toBeNull();
  });

  it("builds a config from env", () => {
    const cfg = llmConfigFromEnv({
      AGENT_API_KEY: "k",
      AGENT_BASE_URL: "https://example.com/v1/",
      AGENT_MODEL: "gpt-x",
    });
    expect(cfg).toEqual({
      apiKey: "k",
      baseUrl: "https://example.com/v1/",
      model: "gpt-x",
    });
  });

  it("applies defaults", () => {
    const cfg = llmConfigFromEnv({ AGENT_API_KEY: "k" });
    expect(cfg?.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg?.model).toBe("gpt-4o-mini");
  });
});

describe("LlmAgent.run", () => {
  it("parses a clean edit reply", async () => {
    vi.stubGlobal(
      "fetch",
      fetchReply(
        JSON.stringify({
          edits: [{ path: "src/App.tsx", before: "a", after: "b" }],
        }),
      ),
    );
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    const { edits } = await agent.run("make it blue", { "src/App.tsx": "a" });
    expect(edits).toEqual([{ path: "src/App.tsx", before: "a", after: "b" }]);
    vi.unstubAllGlobals();
  });

  it("captures token usage and reasoning tokens when reported", async () => {
    vi.stubGlobal(
      "fetch",
      fetchReply(
        JSON.stringify({ edits: [{ path: "a.ts", before: "", after: "x" }] }),
        {
          prompt_tokens: 100,
          completion_tokens: 42,
          total_tokens: 142,
          completion_tokens_details: { reasoning_tokens: 7 },
          prompt_tokens_details: { cached_tokens: 30 },
        },
      ),
    );
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    const result = await agent.run("hi", {});
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 42,
      totalTokens: 142,
      reasoningTokens: 7,
      cacheReadTokens: 30,
    });
    vi.unstubAllGlobals();
  });

  it("strips code fences", async () => {
    const reply = '```json\n{"edits":[{"path":"a.ts","before":"","after":"x"}]}\n```';
    vi.stubGlobal("fetch", fetchReply(reply));
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    const { edits } = await agent.run("hi", {});
    expect(edits[0].path).toBe("a.ts");
    vi.unstubAllGlobals();
  });

  it("rejects path traversal", async () => {
    const reply = JSON.stringify({
      edits: [{ path: "../evil", before: "x", after: "y" }],
    });
    vi.stubGlobal("fetch", fetchReply(reply));
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    await expect(agent.run("hi", {})).rejects.toThrow(/sandbox/);
    vi.unstubAllGlobals();
  });

  it("rejects malformed entries", async () => {
    const reply = JSON.stringify({ edits: [{ path: "a.ts", before: 1, after: 2 }] });
    vi.stubGlobal("fetch", fetchReply(reply));
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    await expect(agent.run("hi", {})).rejects.toThrow(/malformed/);
    vi.unstubAllGlobals();
  });

  it("rejects non-JSON replies", async () => {
    vi.stubGlobal("fetch", fetchReply("I cannot do that."));
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    await expect(agent.run("hi", {})).rejects.toThrow(/not valid JSON/);
    vi.unstubAllGlobals();
  });

  it("surfaces HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    await expect(agent.run("hi", {})).rejects.toThrow(/429/);
    vi.unstubAllGlobals();
  });
});