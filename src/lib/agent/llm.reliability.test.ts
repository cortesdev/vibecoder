import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent, providerErrorText, fixHintFor } from "./llm";

const config = { apiKey: "test-key", baseUrl: "https://provider.invalid/v1", model: "test-model", providerLabel: "Google" };
const reply = () => Response.json({ choices: [{ message: { content: JSON.stringify({ edits: [{ path: "a.ts", before: "", after: "export const a = 1;" }] }) } }] });
const overloaded = () => Response.json([{ error: { message: "This model is currently experiencing high demand." } }], { status: 503 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("provider reliability", () => {
  it("retries a temporary overload and returns actual edits", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(reply());
    vi.stubGlobal("fetch", fetcher);
    const result = new LlmAgent(config).run("build", {});
    const checked = expect(result).resolves.toMatchObject({ edits: [{ path: "a.ts" }] });
    await vi.runAllTimersAsync();
    await checked;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops after three overload responses without blaming the key", async () => {
    const fetcher = vi.fn().mockImplementation(async () => overloaded());
    vi.stubGlobal("fetch", fetcher);
    const result = new LlmAgent(config).run("build", {}).catch((error: Error) => error);
    await vi.runAllTimersAsync();
    const error = await result as Error;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(error.message).toContain("temporarily");
    expect(error.message).not.toContain("Check the Google key");
  });

  it("honors Retry-After before retrying a rate limit", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "2" } })).mockResolvedValueOnce(reply());
    vi.stubGlobal("fetch", fetcher);
    const result = new LlmAgent(config).run("build", {});
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toHaveProperty("edits");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry early when the provider requests a long wait", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("daily quota", { status: 429, headers: { "retry-after": "3600" } }));
    vi.stubGlobal("fetch", fetcher);
    const checked = expect(new LlmAgent(config).run("build", {})).rejects.toThrow(/429/);
    await vi.runAllTimersAsync();
    await checked;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 402, 403, 404])("does not retry a permanent HTTP %s failure", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("rejected", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new LlmAgent(config).run("build", {})).rejects.toThrow(String(status));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung request so fallback can proceed without replaying ambiguous work", async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const checked = expect(new LlmAgent(config).run("build", {})).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(45_000);
    await checked;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("extracts Google's array-shaped error response", () => {
    expect(providerErrorText('[{"error":{"message":"High demand"}}]')).toBe("High demand");
  });

  it("does not describe a malformed request or billing gate as a bad key", () => {
    expect(fixHintFor(400, config)).not.toContain("did not accept the key");
    expect(fixHintFor(402, config)).not.toContain("free models cost nothing");
  });

  it.each([
    { edits: [] },
    { edits: [{ path: "a.ts", before: "stale", after: "new" }] },
  ])("rejects unusable output before the engine charges or starts cooldown", async (content) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })));
    await expect(new LlmAgent(config).run("build", {})).rejects.toThrow(/usable changes/i);
  });
});
