# Graph Report - VibeCoder  (2026-09-24)

## Corpus Check
- 159 files · ~122,626 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 4, .bak 1, .toml 1)

## Summary
- 591 nodes · 1242 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Prompt Intake & Interviews
- Agent App Shell & Routes
- Project API Routes
- Marketing Landing Page
- LLM Agent Core
- Dev Tooling & Lint Config
- Database & Build Scripts
- Stripe & Licensing
- Billing Engine & Credits
- Auth & Site Navigation
- TypeScript Configuration
- Builder Types & Diff View
- Live Preview Bundler
- Runtime Dependencies
- Builder State & Actions
- Metadata & SEO
- Integrations Panel
- Monaco Code Editor
- OpenGraph Image
- Diff Utility
- Terminal Window
- Idea Refine Script
- PostCSS Config
- Vercel Deploy Config

## God Nodes (most connected - your core abstractions)
1. `next` - 41 edges
2. `requireUser()` - 31 edges
3. `react` - 21 edges
4. `db` - 16 edges
5. `compilerOptions` - 16 edges
6. `lucide-react` - 14 edges
7. `vitest` - 14 edges
8. `currentUser()` - 14 edges
9. `runModelPrompt()` - 14 edges
10. `checkFreeReadiness()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `LoginPage()` --calls--> `currentUser()`  [EXTRACTED]
  src/app/login/page.tsx → src/lib/auth.ts
- `mount()` --indirect_call--> `ModelPicker()`  [INFERRED]
  src/components/app/model-picker.test.ts → src/components/app/model-picker.tsx
- `ProjectPage()` --calls--> `findOwnedProject()`  [EXTRACTED]
  src/app/agent/projects/[id]/page.tsx → src/lib/projects.ts
- `POST()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/app/credits/checkout/route.ts → src/lib/auth.ts
- `GET()` --calls--> `requireUser()`  [EXTRACTED]
  src/app/api/app/credits/route.ts → src/lib/auth.ts

## Import Cycles
- None detected.

## Communities (24 total, 5 thin omitted)

### Community 0 - "Prompt Intake & Interviews"
Cohesion: 0.05
Nodes (55): ref_node_http, ref_node_net, GENRES, HomeComposer(), choose(), chooseCustom(), finish(), submit() (+47 more)

### Community 1 - "Agent App Shell & Routes"
Cohesion: 0.08
Nodes (47): nextConfig, lucide-react, next, @prisma/adapter-libsql, AppLayout(), metadata, AppHomePage(), greeting() (+39 more)

### Community 2 - "Project API Routes"
Cohesion: 0.08
Nodes (37): DELETE(), GET(), POST(), POST(), POST(), POST(), POST(), maxDuration (+29 more)

### Community 3 - "Marketing Landing Page"
Cohesion: 0.06
Nodes (34): react, @testing-library/react, three, faqs, jsonLd, metadata, pillars, TerminalChat() (+26 more)

### Community 4 - "LLM Agent Core"
Cohesion: 0.09
Nodes (29): vitest, makeAgent(), buildFileList(), DEFAULT_MAX_INPUT_CHARS, DEFAULT_MAX_OUTPUT_TOKENS, envNameFor(), fixHintFor(), httpError() (+21 more)

### Community 5 - "Dev Tooling & Lint Config"
Cohesion: 0.05
Nodes (43): eslintConfig, devDependencies, eslint, eslint-config-next, jsdom, prisma, tailwindcss, @tailwindcss/postcss (+35 more)

### Community 6 - "Database & Build Scripts"
Cohesion: 0.07
Nodes (33): @libsql/client, ref_node_fs, ref_node_module, ref_node_path, ref_node_url, prisma, dir, from (+25 more)

### Community 7 - "Stripe & Licensing"
Cohesion: 0.12
Nodes (27): stripe, POST(), POST(), deliverLicenseEmail(), POST(), POST(), CopyButton(), metadata (+19 more)

### Community 8 - "Billing Engine & Credits"
Cohesion: 0.11
Nodes (29): LlmConfig, debitForRun(), refundRun(), agentMeta(), baseUrlFor(), cooldownMessage(), FreeRun, call() (+21 more)

### Community 9 - "Auth & Site Navigation"
Cohesion: 0.15
Nodes (17): ref_node_crypto, GET(), GET(), LoginPage(), metadata, SiteNav(), logoFont, Wordmark() (+9 more)

### Community 10 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "Builder Types & Diff View"
Cohesion: 0.12
Nodes (13): useOutsideClose(), Attachment, changeDiff(), ChangeDto, DiffLines(), fmtStamps, MODES, OptionsMenu() (+5 more)

### Community 12 - "Live Preview Bundler"
Cohesion: 0.21
Nodes (9): esbuild-wasm, buildPreview(), CDN, errmsg(), Files, findEntry(), loadEsbuild(), norm() (+1 more)

### Community 13 - "Runtime Dependencies"
Cohesion: 0.15
Nodes (13): dependencies, diff, esbuild-wasm, @libsql/client, lucide-react, @monaco-editor/react, next, @prisma/adapter-libsql (+5 more)

### Community 14 - "Builder State & Actions"
Cohesion: 0.15
Nodes (4): fmtSize(), ProjectBuilder(), attachFiles(), readAsDataUrl()

### Community 15 - "Metadata & SEO"
Cohesion: 0.24
Nodes (4): src_app_globals, metadata, siteConfig, siteUrl

### Community 16 - "Integrations Panel"
Cohesion: 0.31
Nodes (4): IntegrationsPanel(), INTEGRATION_CATEGORIES, INTEGRATIONS, IntegrationService

### Community 17 - "Monaco Code Editor"
Cohesion: 0.33
Nodes (5): @monaco-editor/react, FileEditor(), LANG_BY_EXT, languageFor(), MonacoEditor

### Community 18 - "OpenGraph Image"
Cohesion: 0.40
Nodes (3): alt, contentType, size

## Knowledge Gaps
- **161 isolated node(s):** `idea-refine.sh script`, `eslintConfig`, `nextConfig`, `name`, `version` (+156 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 227 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Agent App Shell & Routes` to `Prompt Intake & Interviews`, `Project API Routes`, `Marketing Landing Page`, `Dev Tooling & Lint Config`, `Stripe & Licensing`, `Auth & Site Navigation`, `Builder Types & Diff View`, `Metadata & SEO`, `Monaco Code Editor`, `OpenGraph Image`?**
  _High betweenness centrality (0.247) - this node is a cross-community bridge._
- **Why does `vitest` connect `LLM Agent Core` to `Prompt Intake & Interviews`, `Marketing Landing Page`, `Dev Tooling & Lint Config`, `Database & Build Scripts`, `Billing Engine & Credits`, `Diff Utility`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `react` connect `Marketing Landing Page` to `Prompt Intake & Interviews`, `Agent App Shell & Routes`, `Project API Routes`, `Dev Tooling & Lint Config`, `Stripe & Licensing`, `Builder Types & Diff View`, `Live Preview Bundler`, `Integrations Panel`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **What connects `idea-refine.sh script`, `eslintConfig`, `nextConfig` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prompt Intake & Interviews` be split into smaller, more focused modules?**
  _Cohesion score 0.0525879917184265 - nodes in this community are weakly interconnected._
- **Should `Agent App Shell & Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.08354646206308611 - nodes in this community are weakly interconnected._
- **Should `Project API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.0792156862745098 - nodes in this community are weakly interconnected._