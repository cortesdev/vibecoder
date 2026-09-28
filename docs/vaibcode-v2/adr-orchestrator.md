# ADR: project service · orchestrator · gateway · preview · workspace · history

## Problem
V2 built working pieces with separate state and contracts: two composers build
the same FormData twice, the page ignores persisted run metadata (download
links die on reload), `?prompt=` deep links are accepted and ignored, runs
never validate their own output, no model declares vision/tool support, the
workspace hides on mobile, and success is reported from HTTP status rather
than user-visible result.

## Decision
Separate six responsibilities with narrow interfaces. No framework, no
abstractions without two consumers (each interface below is consumed by both
a route and a test, or by two UI surfaces).

### 1. Project service (`src/lib/projects/`)
Owns files, template selection, presets, export, shares. Every mutation goes
through it with `findOwnedProject` scoping. New: conflict-checked writes —
`writeFile(userId, projectId, path, content, expectedContent)` returns
`conflict` when current bytes differ from what the editor saw.
Data flow: route → service → Prisma → return DTOs. Never raw upload bytes.

### 2. Agent orchestrator (`src/lib/orchestrator.ts`, new)
One entry: `runTurn(input): Promise<RunOutcome>` where input is
`{userId, projectId, text, attachments, modelId, mode, agent}` and
`agent: "auto" | "mock"` (mock = deterministic, for tests and the e2e success
path). States: `received → understanding → editing → validating → completed`,
or `failed` with an actionable reason at any step:
- understanding: classify question (answer only) vs edit vs plan; gather
  files + skills + normalized attachments; check model capabilities
  (image attachments require a vision-capable model — else fail honestly).
- editing: request structured edits through the gateway; apply valid edits
  via the project service (invalid paths/mismatched `before` are dropped,
  never half-applied).
- validating: bundle the edited tree with the preview builder (Node side);
  on failure, one bounded repair attempt carries the diagnostics back to the
  model. A run is `completed` only with persisted edits + passing validation.
  The last working revision is never overwritten by a failed repair.
- Outcome is truthful: `{status, reply, changedPaths, validation, model,
  usage, notice, error}` — `completed` requires non-empty persisted edits
  (or an explicit answer-only classification), never HTTP 200 alone.

### 3. Model gateway (`engine.ts` + `agent/llm.ts`)
Owns provider config, capability declaration, timeouts, fallback, usage,
errors. `ModelDef` gains `capabilities: {vision, tools}`. `LlmAgent` and
`MockAgent` stay behind `Agent`; the orchestrator never touches fetch.

### 4. Preview service (`lib/preview/*` + pane)
Unchanged contract: stored files → isolated document → diagnostics. Gains a
Node entry (`validate.ts`) reusing `bundleJs` so the orchestrator validates
without a browser. Snapshots feed shares.

### 5. Workspace state (shell, client)
One store: `files`, `selectedPath`, `dirty` (unsaved editor text per path),
`diagnostics`, `activeTab`, `messages`. A successful mutation updates files +
messages + preview together; tab switches never discard `dirty` text. Mobile
gets the same tabs via a tab switcher instead of `hidden md:flex`.

### 6. Run history (`Prompt.metadata` JSON)
`{attachments, exportUrl, changedPaths, validation, model, status, error}`.
The page parses it back into message footers + ZIP links, so reload shows
the same account as the live turn.

## Migration slices (each keeps the app runnable)
1. Orchestrator shell delegating to current `runPrompt` + `agent:"mock"`
   seam + deterministic success e2e.
2. Files CRUD + conflict-checked save routes, Editor panel, unified workspace
   store, mobile tabs.
3. Capabilities map, Node validation, bounded repair inside the orchestrator.
4. Integrations real state (configured/tested/capabilities, no fake
   "connected"), responsive polish.
5. Delete `planPrompt`/`applyChange`/`revertChange`/`saveFile` only with zero
   callers; final gates + demo.

## Accepted trade-offs
- Orchestrator starts as a thin wrapper (duplication with `runPrompt`
  internals) and absorbs it by slice 3 — two-conumser rule waived for the
  seam itself, recorded here.
- Mock success path is test-only surface (`agent:"mock"` never offered in UI).
