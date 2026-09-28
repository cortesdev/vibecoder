# ADR: browser-only preview + request-scoped uploads (vaibcode-V2)

## Preview architecture
- **Decision:** bundle stored project files in the browser with esbuild-wasm
  (initialized once per session, content-hash JS cache capped at 20 entries),
  render via `iframe srcDoc`. No localhost Vite server in any path;
  `lib/project-server.ts` and the `.../server` route are deleted.
- **React resolution:** bare `react`, `react-dom`, `react-dom/client`,
  `react/jsx-runtime` redirect to pinned esm.sh 19.2.8 (single constant).
  Bundle format is ESM injected as `<script type="module>` — IIFE was tried
  and fails at runtime (`require("https://…")` from externalized CDN specs).
- **Sandbox:** `sandbox="allow-scripts"` only — no `allow-same-origin`
  (which plus scripts would let the frame drop its own sandbox), no popups.
  Trade-off: generated apps cannot open new tabs or submit real forms; all
  shipped templates use `preventDefault` handlers, so nothing breaks.
- **CSP:** restrictive `<meta>` policy (inline + https scripts only, no
  objects/frames, `form-action 'none'`). `frame-ancestors` intentionally
  omitted — ignored in `<meta>`, only logs noise; framing protection comes
  from the sandbox + opaque srcDoc origin.
- **Bridge:** one-way preview→parent error reports, validated by
  same-window source, `"null"` origin, per-build nonce, known type, 2kB cap.
  The parent never evaluates preview content.
- **Shares:** stored snapshot HTML + sha256-hashed bearer token, 7-day TTL,
  revocation flag; invalid/expired/revoked share one uniform answer.

## Upload architecture
- **Request-scoped pipeline, no byte persistence:** uploads live in multipart
  memory only; SQLite stores descriptions + export URL in `Prompt.metadata`.
  Client prechecks (type + 8 MiB) for feedback; server re-validates by magic
  bytes (spoof-proof), 8 MiB/file, 6 files, 20 MiB total, 60k text chars.
- **SVG:** inert markup allowed (rendered only via `<img>`), active content
  (script/handlers/javascript:) rejected 415.
- **GIF:** forwarded with documented first-frame semantics. **MP4/WebM:**
  never sent as `image_url`; frames come only from an injected extractor
  (4 stills, first 5s, ≤768px, 20s budget, reports its limiting bound), else a
  415 naming the limitation — never a text guess presented as vision.
- **No PDF text engine** ships in this runtime: PDFs are accepted as named
  containers with extraction flagged unavailable downstream.

## Operating limits
- Free-model quotas are the providers', not ours; readiness + failover make
  that visible instead of hiding it. No SLA on anything free.
- `VIBECODER_BASE_URL_CUSTOM` + `custom-auto` absorb every OpenAI-compatible
  endpoint (local FreeLLMAPI, Ollama, vLLM) without new registry entries.
- Known debt (pre-existing, untouched): `engine.freewallet` tests describe a
  wallet/cooldown behavior the engine no longer implements (7 failing tests);
  `planPrompt`/`applyChange`/`revertChange` have no callers since the old
  chat was stripped — reserved for the plan/apply flows.
- Fresh-database gap fixed: `Prompt` chat columns never had a migration;
  repair migration added and the deploy applier now skips already-present
  objects instead of failing. `LICENSE_DB_URL=file:…` is now honored, and
  empty-string env counts as unset.
