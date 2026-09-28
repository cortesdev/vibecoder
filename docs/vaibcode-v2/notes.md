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
