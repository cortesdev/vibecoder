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
