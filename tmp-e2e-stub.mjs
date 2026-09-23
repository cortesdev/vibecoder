// THROWAWAY. Local OpenAI-compatible stub that mirrors the documented request
// and response contract of Z.ai / Google (Bearer auth, /chat/completions,
// choices[0].message.content, usage.*), so the app's real prompt surface can be
// driven end to end without a real provider key. Deleted after the run.
import { createServer } from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 4599);
let mode = "ok"; // ok | 401 | 403 | 429
const seen = [];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

/** Pull the "--- path ---" blocks the agent sends as project context. */
function extractFiles(text) {
  const files = {};
  const re = /\n--- ([^\n]+) ---\n/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ path: m[1], start: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const { path, start } = marks[i];
    const next = marks[i + 1];
    const stop = next
      ? text.lastIndexOf(`\n--- ${next.path} ---\n`, next.start)
      : text.indexOf("\n\nUser prompt:", start);
    files[path] = text.slice(start, stop === -1 ? text.length : stop);
  }
  return files;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/_requests") return json(res, 200, seen);
  if (req.method === "POST" && url.pathname === "/_mode") {
    mode = url.searchParams.get("v") ?? "ok";
    return json(res, 200, { mode });
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    seen.push({
      method: req.method,
      path: url.pathname,
      authorization: req.headers.authorization ?? "",
      contentType: req.headers["content-type"] ?? "",
      body,
    });

    if (mode !== "ok") {
      const detail =
        mode === "401"
          ? { error: { code: "1001", message: "Authentication parameter not received in Header, unable to authenticate" } }
          : { error: { type: "Forbidden", message: "stub refusal" } };
      return json(res, Number(mode), detail);
    }
    if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
      return json(res, 404, { error: { message: "stub: no such route" } });
    }

    const user = (body?.messages ?? []).find((msg) => msg.role === "user")?.content ?? "";
    const files = extractFiles(user);
    const before = files["src/App.tsx"] ?? "";
    const after = before.replace("Hello from Vibecoder", "Hello from the free model");

    json(res, 200, {
      id: "stub-completion-1",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body?.model ?? "stub",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({ edits: [{ path: "src/App.tsx", before, after }] }),
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 40,
        total_tokens: 160,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`stub listening on http://127.0.0.1:${PORT}`));
