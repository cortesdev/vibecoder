# vaibcode-V2 — implementation notes

Branch: `vaibcode-V2` (cut from `main` with in-progress free-chain + routed-via chat work).

## Skill workflow
The 13 named skills (spec-driven-development, planning-and-task-breakdown, …)
are **not installed in this environment** — verified: no such skills are
available to invoke. Per the brief, each engineering step below is performed
directly instead, with its concrete output recorded here. Nothing below
pretends a skill was invoked.

## M1 — repo inspection: locked contracts

### Prisma models (prisma/schema.prisma)
License, LicenseActivation, User, AgentLearning, UserKey (`provider` free
string), CreditWallet, CreditTxn (unique `[reason, ref]`), ServiceKey,
FreeWallet, FreeTxn, FreeCooldown, Session (`tokenHash` unique, never raw),
Project (files/prompts/changes), ProjectFile (unique `[projectId, path]`),
Prompt (`role/mode/modelId/modelLabel/error`, **no metadata field yet**),
Change (`status` pending|applied|reverted).

### Route layout (App Router)
- `/api/app/projects` POST `{name}` → create (no template param yet).
- `/api/app/projects/[id]` GET/PATCH/DELETE; `files/[...path]`; `changes/[id]/apply|revert`;
  `prompt` (JSON) + `prompt/stream` (SSE: status/heartbeat/error/done/plan_done);
  `server` (spawns/fetches localhost Vite — **must be removed**, GAP 2);
  `apply-preset`.
- `/api/app/keys` (BYO keys + readiness), `/api/app/wallet`, credits, auth, license, stripe, updates.

### Project files
`scaffoldFor(rawName): Record<string,string>` in `src/lib/projects.ts:46`
(white-label landing starter). `createProject(userId, name)` stores its output
as ProjectFiles. Single caller of each: `src/app/api/app/projects/route.ts`.

### Agent contract
`Agent { run(prompt, files, context?): Promise<AgentResult>; plan(prompt, files, options): Promise<AgentResult> }`
(`src/lib/agent/types.ts`). `LlmAgent` POSTs OpenAI-style
`/chat/completions` with `{model, max_tokens, messages:[system,user]}` and
parses `{"reply","edits":[...]}`; retries 429/5xx with backoff inside a
45s budget. `MockAgent` = deterministic same-contract edits, zero network.
`runModelPrompt` (engine.ts) walks the 7-model free chain (openrouter-free,
groq-gpt-oss, cerebras-llama, glm-flash, hf-gpt-oss, nemotron, gemini-flash)
then credits tier; returns `modelId/modelLabel/providerLabel/latencyMs/usage/notice`.

### Preview implementation
`preview-pane.tsx`: esbuild-wasm bundles stored files in-browser, React
19.2.8 via esbuild CDN redirect (esm.sh), iframe `srcDoc`. Debounce 350ms,
Refresh, Desktop/Mobile, Open-in-tab, Click-to-interact — all present.
**Unsafe remainder:** `serverUrl/serverStatus/useServer` path polls
`.../server`, fetches `http://localhost:PORT/` HTML into the iframe, and the
sandbox is `allow-scripts allow-same-origin allow-forms allow-popups`.
`project-server.ts` spawns real Vite processes on disk (`.vibecoder-projects/`).

### Test conventions
Vitest, `src/**/*.test.ts` + `tests/**/*.test.ts`, `@` alias, node env.
Co-located `<module>.test.ts`. Known pre-existing failures (identical on clean
`main`): 7 (stale freewallet/cooldown mocks, `openrouter-paid cost 0`
assertion) + jsdom/undici worker errors in component tests.

### Baseline gates (M1, branch vaibcode-V2)
- `npx tsc --noEmit` → clean.
- `pnpm build` → clean.
- `pnpm lint` → 8 errors / 12 warnings, all in untouched files
  (preview-pane `any`s, project-builder hooks/img, project-server `_`).
- `pnpm test` → 97 passed / 7 failed (pre-existing, see above).

### Migration (this milestone)
- `Project.activePresetId: String?`
- `Prompt.metadata: String?` (nullable JSON text, SQLite convention)
- `PreviewShare { id, projectId, tokenHash unique, createdAt, expiresAt, revokedAt? }`
  with `Project.shares` relation. Bearer token never stored.

## Reset — chat + asides stripped to shells (pre-rebuild)
- `project-builder.tsx` → layout-only shell (same props + DTO exports, so
  `[id]/page.tsx` compiles untouched): read-only history, disabled composer,
  five empty tabs. Zero fetching, zero agent calls.
- Deleted with no remaining importers: `editor.tsx`, `preview-pane.tsx`,
  `ui-presets-panel.tsx`, `integrations-panel.tsx`, `lib/project-server.ts`
  (localhost-Vite production path gone with it, per GAP 2).
- Deleted routes: `prompt/`, `prompt/stream`, `changes/`, `files/`,
  `server/`, `apply-preset/`. Kept: `[id]/route.ts` (project CRUD),
  `projects/route.ts` (create).
- Kept intentionally: `model-picker`, `home-composer`, `settings-client`,
  `new-project-picker`, engine/models/readiness/lib (service layer stays).
- Gates after strip: `tsc` clean, `pnpm build` clean, `pnpm lint` 0 errors
  (6 warnings), tests 107 passed / 7 failed (same pre-existing 7).

## M3 — browser-only preview (complete)
- `preview/build-preview.ts`: pure bundling (VFS plugin, React 19.2.8 CDN map,
  outfile fix for CSS, escape/assemble/snapshot + restrictive CSP,
  per-nonce one-way error bridge injection).
- `preview/bridge.ts` + tests: source/nonce/type/size validation; snippet has
  no eval/commands.
- `preview-toolbar.tsx` (controlled, labelled) + `preview-pane.tsx` (esbuild
  once/session, content-hash JS cache with nonce applied post-cache, 350ms
  debounce / immediate refresh, runtime-error surfacing, `sandbox="allow-scripts"`
  only, no localhost fetch anywhere).
- Wired into the workspace shell Preview tab. Gates: 23/23 preview+template
  tests, tsc + lint clean, build clean. Browser/axe verification deferred to M8.

## M4 — ZIP export (complete)
- `projects/export.ts` (fflate): POSIX normalize, traversal/drive/NUL/empty/
  duplicate rejection with offending path, secrets skipped (.env*, *.pem,
  *.key), 20 MB cap, sanitized filename. 14 tests green first run.
- Route `GET .../[id]/export`: auth → ownership → ZIP (`application/zip`,
  attachment filename) or structured `{error, path?}` (401/404/422).
- UI: `ExportButton` (loading/error states) in workspace header + Files-tab
  rows (minimal read-only file list added to the shell for this), plus
  `RunDownloadLink` ("Done — updated X. Download ZIP") ready for the chat
  rebuild — all three hit the same route.
- Acceptance proven for real: blog template exported, `pnpm install` +
  `pnpm build` (vite) succeeded in /tmp.
- Gates: tsc + lint clean, build clean, 37/37 in-scope tests.
## M2 — six templates + picker (complete)
- `templates/shared.ts`: base files (React 19.2.8 pkg, index.html, main.tsx,
  tsconfig, vite config), theme delimiters `/* vibecoder:theme:start|end */`.
- Six modules (landing, saas-dashboard, portfolio, blog, ecommerce-lite,
  chat-app): distinct functional starters, react-only imports, no backticks.
- `templates/catalog.ts`: TemplateId, metadata, `filesFor`/`resolveTemplate`
  (unknown → landing).
- `catalog.test.ts` (5 tests) + `build.test.ts` (parameterized real bundling).
  TDD caught a genuine bug: CSS imports fail without `outfile` even when
  `write:false` — the old preview-pane had the same latent bug. Fixed in
  `preview/build-preview.ts` (pure module: norm/loader/entry/CDN/bundle/
  escape/assemble/snapshot).
- `createProject(userId, name, templateId?)`; `scaffoldFor` retired (zero
  remaining references); route accepts `templateId`.
- `new-project-picker.tsx` (?template=, six cards, visible fallback),
  thumbnails in `public/templates/*.svg`, wired into `/agent` + HomeComposer
  (live search-param read, Suspense-wrapped).
- FreeLLM gateway built in: provider `custom` + free model `custom-auto`
  (`model: "auto"`, no default base URL — inert until
  `VIBECODER_BASE_URL_CUSTOM` is set; key via `VIBECODER_CUSTOM_API_KEY` /
  user BYO). Second in FREE_PREFERENCE; skipped when unconfigured.
- Gates: tsc clean, eslint 0 errors (2 `<img>` warnings, static thumbs),
  build clean, templates 11/11 green; only pre-existing `openrouter-paid`
  failure in scope.

## M5 — image + document attachments (complete)
- `agent/types.ts`: `AgentAttachment` (image/videoFrames/document),
  `AgentRequest`, `AgentRunResult` (+`changedPaths`, `success`,
  `toRunResult`); attachments travel on `AgentRunContext`, one contract.
- `attachments/server.ts`: magic-byte sniffing, 8 MiB/file (413 "8 MB per
  file"), spoof rejection, inert-SVG-only, bounded text + truncation flag,
  JSON/UTF-8 validation, PDF-as-container, request bounds (6 files/20 MiB).
- `attachments/client.ts`: pre-read precheck, ext fallback, 2048px downscale
  (browser-only, throws clearly elsewhere). `attachment-picker.tsx`: dialog,
  paste, drag/drop, thumbs/badges, per-file errors.
- `llm.ts userContentBlocks`: image_url (auto), labeled doc text, timestamped
  low frames; text-only path byte-identical. MockAgent records the normalized
  payload deterministically. 54/54 agent tests.
- Route `POST .../[id]/agent` (multipart, typed JSON; 413/415 with
  code/fileName/limitBytes; rejected bytes never reach the model; video →
  actionable 415 via `unsupportedRunner`). 8 route tests.
- `runPrompt` gained `agentAttachments` + `metadata` (attachment descriptions
  + export URL persisted on assistant rows). Minimal working composer in the
  shell (multipart send, routed-via footer, notices, RunDownloadLink, text
  preserved on error) + HomeComposer two-step (create → first turn, no more
  silently dropped attachments; mode now forwarded).
- Live-model screenshot acceptance pending provider keys in the test env.

## M6 — bounded video extraction (complete)
- `attachments/video.ts`: 5s window, ≤4 frames, ≤768px, 20s budget, injected
  `VideoRunner` (deterministic tests), raw video never forwarded, `stoppedBy`
  reported. 5 tests.

## M7 — variable presets + exact undo (complete)
- `presets.ts`: 8 identities as CSS-var sets + thumb meta. `presets/apply.ts`:
  delimited-section rewrite, byte-identical elsewhere, readable rejections.
- `applyProjectPreset`/`undoProjectPreset`: persist `activePresetId`, undo
  bytes on the chat message, refuse-after-edit, consume-once. Route
  `POST .../presets` (apply/undo). `preset-panel.tsx` wired into shell.
- 25/25 tests. Pixel/persist proof via e2e (apply → reload shows Current →
  undo restores).

## M8 — shares, gates, verification (complete)
- `preview/share.ts` + tests, `POST/DELETE .../shares`, public `/p/[token]`
  (uniform unavailable), share button copies link.
- `instrument.ts`: duration/outcome/code events, never content; wired into
  agent/export/preset routes + preview builds.
- e2e (`playwright.config.ts` + `v2-flow.spec.ts`, isolated /tmp DB from
  global-setup, scrubbed provider keys): picker, client zip rejection, error
  path with intact text, preview renders starter, toolbar keyboard, export
  download, preset persist + undo, **axe zero criticals**. GREEN.
- Bug trail from e2e (all fixed): localhost↔127.0.0.1 origin split, Turso
  scrub breaking DB, `Prompt` columns missing chain-wide (repair migration +
  idempotent applier), IIFE+CDN runtime require (→ESM), tablist axe
  violation, `file:` DB URL quirk, empty-string env quirk.
- Full gates: tsc clean, eslint 0 errors, build clean, vitest 188 passed /
  7 pre-existing failures, Playwright 1/1.
- Deferred honestly: live-model attachment proof (needs keys), load testing
  (budgets set, not measured), plan/apply flows (`planPrompt` etc. reserved).

## Refactor pass — architecture integration (in progress)
Baseline on this HEAD: tsc clean, 189 passed / 7 pre-existing failures.
Trace findings: composers duplicate FormData logic; page ignores run
metadata; `?prompt=` accepted but ignored; runs never validate output;
no model capability flags; workspace hidden on mobile; success reported
from HTTP status. ADR: `docs/vaibcode-v2/adr-orchestrator.md`.

### Slice 1 — orchestrator seam + mock success (complete)
- `engine.runModelPrompt` accepts `agentKind: "auto"|"mock"` (mock: no keys,
  debits, or network); threaded through `runPrompt`.
- `orchestrator.runTurn` (tested: completed/failed mapping, seam passthrough);
  agent route uses it, honors `agent:"mock"` only when
  `VIBECODER_AGENT_MOCK=1`.
- Page parses `Prompt.metadata` back into footers; `runPrompt` merges routing
  outcome into stored metadata → reload shows the same account + ZIP link.
- e2e `mock-success.spec.ts` GREEN (3.8s): create → mock turn (changedPaths)
  → preview renders → reload shows routed-via + ZIP → download works.

### Slice 2 — Editor + cross-tab workspace state (complete)
- `projects.ts`: `createProjectFile` (refuses occupied), `saveProjectFile`
  (409 with current bytes on stale `expectedContent`), `renameProjectFile`,
  `deleteProjectFile` — all ownership + sandbox validated. 6 service tests.
- Routes: collection POST/PATCH/DELETE + single GET/PUT (5 route tests).
- `editor-panel.tsx`: edit, Cmd/Ctrl+S save, dirty dot, conflict UI with
  overwrite/reload-theirs, diagnostics prop. `files-panel.tsx`: list, open,
  create, rename, delete, per-row ZIP.
- `workspace-shared.tsx` holds DTOs + download UI (no component cycle).
- Shell store: `saved` (server) + `dirty` per path + selection + diagnostics;
  mutations update all views and refresh server truth. Fixed real bug found
  by e2e: merge resurrected deleted files — mutations now refresh.
- Mobile: Chat/Workspace switcher replaces `hidden md:flex`.
- e2e: create→edit→save→reload persists, stale write 409s honestly, delete
  propagates, mobile switch works. Gates: tsc/lint(0 err)/build green.

### Slice 3 — capability gate + validation + bounded repair (complete)
- `ModelDef.capabilities: { vision, tools }` declared for all 12 registry
  entries; vision true for openrouter-free, custom-auto, gemini-flash,
  sonnet, haiku, gpt, openrouter-paid. Registry test asserts every model
  declares both flags and that the free chain has a vision fallback.
- `preview/validate.ts`: Node-side `validateProject` reusing `bundleJs`;
  returns file-attributed diagnostics for the editor. 3 tests (pass, broken
  import, path attribution). `formatBuildError` now surfaces esbuild's
  `errors[]` (it previously lost detail to the first message line).
- `orchestrator.resolveVisionModel`: an image/video turn never reaches a
  blind model — it reroutes to vision with a notice, or fails unserved
  before any billable call. Text turns are untouched.
- `runTurn` now: understanding (capability) → editing (persist) →
  validating (bundle). On failure exactly ONE bounded repair turn; if that
  also fails, `restoreProjectFiles` rolls back to the last working revision
  and the turn reports failed — never "Done". Answer-only turns complete
  without a build. Validation outcome persisted onto the assistant turn's
  metadata and returned to the client.
- `projects.ts`: runPrompt returns `assistantPromptId`; added
  `updatePromptMetadata` (ownership-checked merge) and `restoreProjectFiles`
  (upsert snapshot, delete files created after it).
- Bug found by the e2e gate: validation failed in the Next server with
  "The service is no longer running" — esbuild-wasm was being bundled, so
  its worker host broke outside the browser. Fixed with
  `serverExternalPackages: ["esbuild-wasm"]` in `next.config.ts`.
- Gates: tsc clean; vitest 216 pass / 7 pre-existing fail (no regressions,
  +27 new tests); playwright 4/4; build clean; lint 0 errors.

### Slice 4 — editor diagnostics, integrations, vision coverage (complete)
- Turn validation now reaches the Editor: `applyValidation` maps the
  response's per-file errors into the existing diagnostics store, a manual
  save clears that file's diagnostics, and a failed turn (which rolled files
  back) clears them all so nothing points at code that no longer exists.
- `integrations-panel.tsx`: the placeholder tab is now a real surface over
  the pre-existing `/api/app/integrations` GET/POST/DELETE API — category
  filter, connect form (key + label), connected counts, and remove. Keys are
  write-only from the client: the panel only ever receives counts, so a key
  cannot come back after being saved. Project page passes the catalog +
  counts from `listServiceKeys`.
- Closed a real gap from the baseline audit: `initialPrompt` was declared in
  the prop types but never destructured, so `?prompt=` deep links were
  silently dropped. It now pre-fills the composer.
- e2e: an image turn pinned to the blind `groq-gpt-oss` is rerouted to a
  vision model and says so; integrations connect → 1 connected → remove.
- Gates: tsc clean; vitest 216 pass / 7 pre-existing fail; playwright 6/6;
  build clean; lint 0 errors.
