import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Readiness is the one place that talks to a provider outside a prompt run, so
// these tests drive it against a real HTTP server that speaks the documented
// OpenAI-compatible contract. Everything provider-specific goes through the
// registry + engine seams, which is what makes one stub enough for every
// provider: only the base URL differs.

const userKey = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("./db", () => ({
  db: {
    userKey: { findUnique: async () => (userKey.value ? { key: userKey.value } : null) },
  },
}));

import { checkFreeReadiness, checkModelReadiness, invalidateReadiness } from "./readiness";
import { getModel } from "./models";

interface Seen {
  method: string;
  path: string;
  auth: string;
}

type Reply = { status: number; body: unknown; contentType?: string };

const CATALOG: Reply = {
  status: 200,
  body: { object: "list", data: [{ id: "gemini-3.8-flash" }, { id: "gemini-3.8-flash-lite" }] },
};
const ANSWER: Reply = {
  status: 200,
  body: {
    id: "chatcmpl-1",
    model: "gemini-3.8-flash",
    choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
  },
};

let server: Server;
let baseUrl = "";
let seen: Seen[] = [];
let replies: Record<string, Reply> = {};

/** Order matters: catalog first, then the completion, so a test can set both. */
function stubReplies(next: Record<string, Reply>) {
  replies = next;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({
      method: req.method ?? "",
      path: new URL(req.url ?? "/", "http://127.0.0.1").pathname,
      auth: req.headers.authorization ?? "",
    });
    const reply = replies[req.method === "GET" ? "list" : "complete"] ?? {
      status: 404,
      body: { error: { message: "stub: nothing configured for this route" } },
    };
    res.writeHead(reply.status, {
      "content-type": reply.contentType ?? "application/json",
    });
    res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VIBECODER_BASE_URL_GOOGLE = baseUrl;
});

afterAll(async () => {
  delete process.env.VIBECODER_BASE_URL_GOOGLE;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const KEY_VARS = [
  "VIBECODER_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "VIBECODER_MODEL_GEMINI_FLASH",
];

beforeEach(() => {
  userKey.value = null;
  seen = [];
  replies = {};
  for (const name of KEY_VARS) delete process.env[name];
  process.env.GEMINI_API_KEY = "platform-gemini-key";
});

afterEach(() => invalidateReadiness("u1"));

const GEM = getModel("gemini-flash")!;

describe("model readiness", () => {
  it("reports live, naming the model that actually answered and the catalog size", async () => {
    stubReplies({ list: CATALOG, complete: ANSWER });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("live");
    expect(result.answeredModel).toBe("gemini-3.8-flash");
    expect(result.catalogSize).toBe(2);
    expect(result.source).toBe("platform");
    expect(result.providerLabel).toBe("Google");
    expect(result.message).toContain("accepted");
    expect(result.message).toContain('"gemini-3.8-flash"');
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /models",
      "POST /chat/completions",
    ]);
    expect(seen.every((s) => s.auth === "Bearer platform-gemini-key")).toBe(true);
  });

  it("still calls it live when the provider publishes no model list", async () => {
    // Some providers document no /models endpoint, so a 404 there must never
    // read as a bad key.
    stubReplies({ list: { status: 404, body: { error: { message: "not found" } } }, complete: ANSWER });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("live");
    expect(result.catalogSize).toBeUndefined();
    expect(seen.map((s) => s.path)).toContain("/chat/completions");
  });

  it("points at the override variable when the configured model id is gone", async () => {
    process.env.VIBECODER_MODEL_GEMINI_FLASH = "gemini-3.8-flash-retired";
    stubReplies({
      list: CATALOG, // catalog loaded, but without the id we are configured to use
      complete: { status: 404, body: { error: { message: "The model 'gemini-3.8-flash-retired' does not exist" } } },
    });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("model_missing");
    expect(result.notInCatalog).toBe(true);
    expect(result.message).toContain("VIBECODER_MODEL_GEMINI_FLASH");
    expect(result.message).toContain("does not exist");
  });

  it("reports a rejected key with the provider's own words and the fix, without spending a completion", async () => {
    stubReplies({
      list: { status: 401, body: { error: { code: "1001", message: "Authentication parameter not received in Header, unable to authenticate" } } },
    });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("rejected");
    expect(result.message).toContain("Google refused");
    expect(result.message).toContain("Authentication parameter not received in Header");
    expect(result.message).toContain("Settings → API keys");
    expect(result.message).toContain("VIBECODER_GEMINI_API_KEY");
    expect(seen.map((s) => s.path)).toEqual(["/models"]); // no point asking for a completion
  });

  it("separates a spent quota from a bad key", async () => {
    stubReplies({
      list: CATALOG,
      complete: { status: 429, body: { error: { message: "Rate limit reached for gemini-3.8-flash" } } },
    });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("rate_limited");
    expect(result.message).toContain("rate limiting");
    expect(result.message).not.toContain("Settings → API keys"); // it is not a key problem
  });

  it("says no key without touching the network when nothing is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    seen = [];
    const results = await checkFreeReadiness("u1", { refresh: true });

    expect(results.map((r) => r.status)).toEqual(["no_key"]);
    expect(results[0].source).toBe("none");
    expect(results[0].message).toContain("Settings → API keys");
    expect(results[0].message).toContain("GEMINI_API_KEY");
    expect(seen).toEqual([]); // an unconfigured provider is never called
  });

  it("treats an empty platform key as unset, like Vercel hands a build", async () => {
    process.env.GEMINI_API_KEY = "   ";
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("no_key");
    expect(seen).toEqual([]);
  });

  it("uses the user's own key and says so", async () => {
    userKey.value = "user-own-gemini-key";
    stubReplies({ list: CATALOG, complete: ANSWER });
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("live");
    expect(result.source).toBe("user");
    expect(result.message).toContain("your key");
    expect(seen.every((s) => s.auth === "Bearer user-own-gemini-key")).toBe(true);
  });

  it("reports an unreachable provider instead of blaming the key", async () => {
    process.env.VIBECODER_BASE_URL_GOOGLE = "http://127.0.0.1:9";
    const result = await checkModelReadiness("u1", GEM);

    expect(result.status).toBe("unreachable");
    expect(result.message).toContain("could not be reached");
    process.env.VIBECODER_BASE_URL_GOOGLE = baseUrl;
  });

  it("caches briefly, re-probes on refresh, and forgets on invalidate", async () => {
    stubReplies({ list: CATALOG, complete: ANSWER });

    await checkFreeReadiness("u1", { refresh: true });
    const callsAfterFirst = seen.length;

    await checkFreeReadiness("u1"); // served from cache
    expect(seen.length).toBe(callsAfterFirst);

    await checkFreeReadiness("u1", { refresh: true });
    expect(seen.length).toBeGreaterThan(callsAfterFirst);

    invalidateReadiness("u1");
    const before = seen.length;
    await checkFreeReadiness("u1");
    expect(seen.length).toBeGreaterThan(before);
  });
});


it("reports overload as temporary unavailability rather than a rejected key", async () => {
  stubReplies({ list: CATALOG, complete: { status: 503, body: [{ error: { message: "High demand" } }] } });
  const result = await checkModelReadiness("u1", GEM);
  expect(result.status).toBe("unreachable");
  expect(result.message).toContain("temporarily");
  expect(result.message).toContain("High demand");
  expect(result.message).not.toContain("Settings → API keys");
});