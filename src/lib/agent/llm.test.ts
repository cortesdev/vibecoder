import { describe, expect, it, vi } from "vitest";
import { LlmAgent, compactSource, llmConfigFromEnv, outputTokenBudget } from "./llm";

/** The JSON body the agent posted on its first (or only) request. */
function sentBody(fetcher: { mock: { calls: unknown[][] } }, call = 0): Record<string, unknown> {
  const init = fetcher.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

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

describe("output token budget", () => {
  it("prefers the configured cap over the env default", () => {
    expect(outputTokenBudget({ maxOutputTokens: 1234 })).toBe(1234);
    expect(outputTokenBudget({})).toBeGreaterThan(0);
  });

  it("sends max_tokens on every request so a run cannot run away", async () => {
    const fetcher = fetchReply(JSON.stringify({ edits: [{ path: "a.ts", before: "", after: "x" }] }));
    vi.stubGlobal("fetch", fetcher);
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m", maxOutputTokens: 1500 });
    await agent.run("hi", {});
    expect(sentBody(fetcher).max_tokens).toBe(1500);
    vi.unstubAllGlobals();
  });

  it("names the cap when the provider stopped on it, instead of looking empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "" }, finish_reason: "length" }] }),
      }),
    );
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m", maxOutputTokens: 900 });
    await expect(agent.run("hi", {})).rejects.toThrow(/900-token output budget/);
    vi.unstubAllGlobals();
  });
});

describe("compactSource", () => {
  it("drops whole-line comments and blank lines, and keeps code", () => {
    const src = "// lead\n\nconst a = 1;\n\n/* block\n   spans */\nconst b = 2;\n";
    expect(compactSource(src, "src/a.ts")).toBe("const a = 1;\nconst b = 2;");
  });

  it("never touches an inline comment, a string or a URL", () => {
    const src = 'const url = "https://x.dev/a"; // trailing\nconst m = 1 / 2;\n';
    expect(compactSource(src, "src/a.ts")).toBe('const url = "https://x.dev/a"; // trailing\nconst m = 1 / 2;');
  });

  it("leaves formats with no comments to strip alone", () => {
    const html = "<html>\n\n  <body></body>\n</html>\n";
    expect(compactSource(html, "index.html")).toBe(html);
  });
});

describe("compacted context", () => {
  it("sends every file, compacted, and still accepts the edit", async () => {
    const raw = "// a comment\n\nexport const a = 1;\n\n// another\n";
    const fetcher = fetchReply(
      JSON.stringify({
        edits: [{ path: "src/a.ts", before: "export const a = 1;", after: "export const a = 2;" }],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    const { edits } = await agent.run("bump it", { "src/a.ts": raw, "index.html": "<html></html>" });

    const sent = String((sentBody(fetcher).messages as { content: string }[])[1].content);
    expect(sent).toContain("index.html"); // nothing is ever dropped
    expect(sent).toContain("export const a = 1;");
    expect(sent).not.toContain("a comment"); // comments are stripped

    // `before` is the real file, so a revert restores the original bytes.
    expect(edits).toEqual([{ path: "src/a.ts", before: raw, after: "export const a = 2;" }]);
    vi.unstubAllGlobals();
  });

  it("still rejects an edit whose before matches nothing", async () => {
    const fetcher2 = fetchReply(
      JSON.stringify({
        edits: [{ path: "src/a.ts", before: "export const zzz = 9;", after: "export const a = 2;" }],
      }),
    );
    vi.stubGlobal("fetch", fetcher2);
    const agent = new LlmAgent({ apiKey: "k", baseUrl: "https://x/v1", model: "m" });
    await expect(agent.run("bump it", { "src/a.ts": "export const a = 1;\n" })).rejects.toThrow(
      /no usable changes/,
    );
    vi.unstubAllGlobals();
  });
});