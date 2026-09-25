# Graph Report - VibeCoder  (2026-09-25)

## Corpus Check
- 78 files · ~128,520 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 804 nodes · 1445 edges · 46 communities (41 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AI Model Execution Engine
- Authentication, Wallets, and Navigation
- Transactional Project Change API
- Updater Artifacts and Migrations
- Project Builder and Integrations
- Payments, Credits, and Licensing
- Package Dependencies and Tooling
- Product Specifications and Releases
- Prompt, Models, and Settings
- Provider Keys and Readiness
- TypeScript Compiler Configuration
- Project Development Server
- Development Tooling Dependencies
- Live Preview Build Pipeline
- Performance Observability and Rollback
- Animated Video Intro
- Safe Migrations and Vertical Slices
- Security Hardening and Source Verification
- VibeCoder Brand Icon Assets
- Test-Driven Planning and Review
- Git Workflows and Desktop Updates
- Site Metadata and SEO
- Terminal Replica and Animation
- New Project, Chat, and Upgrades
- Desktop Download Selector
- Homepage Marketing and Chat
- Debugging and Code Simplification
- Pricing UI Design System
- Interactive Idea Refinement
- Requirements Interviews and Specs
- Animated Globe Background
- Vercel Logo Asset
- Homepage Route and Wrapper
- Generic File Icon Asset
- Social Preview Image
- Globe Icon Asset
- Next.js Logo Asset
- Untrusted External Content Boundaries
- Quality Floor Guardrails
- Agent Coding Rule Hierarchy
- Window Icon Asset
- Terminal Window Component
- Idea Refinement Shell Script
- PostCSS Configuration
- Vercel Deployment Configuration
- PNPM Build Dependency Policy

## God Nodes (most connected - your core abstractions)
1. `next` - 44 edges
2. `requireUser()` - 33 edges
3. `react` - 23 edges
4. `db` - 18 edges
5. `Using Agent Skills Skill Guide` - 18 edges
6. `compilerOptions` - 16 edges
7. `lucide-react` - 14 edges
8. `vitest` - 14 edges
9. `checkFreeReadiness()` - 12 edges
10. `ProjectBuilder()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Replica Security and Failure Constraints` --semantically_similar_to--> `Threat Model First`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-09-23-code-replica.md → agent/skills/security-and-hardening/SKILL.md
- `Credit Meter States` --semantically_similar_to--> `Metric Threshold Rollback`  [INFERRED] [semantically similar]
  mockups/vibecoder-pricing-credits.html → agent/skills/shipping-and-launch/SKILL.md
- `Reviewable and Reversible Trust Features` --semantically_similar_to--> `Transactional Prompt Change Flow`  [INFERRED] [semantically similar]
  LANDING_COPY.md → docs/superpowers/specs/2026-09-23-vibecoder-projects-routes.md
- `Transactional Prompt Change Flow` --semantically_similar_to--> `Reviewable Generation Pipeline`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-09-23-vibecoder-projects-routes.md → PROMPT.md
- `Automated Quality Gate Pipeline` --semantically_similar_to--> `Vibecoder Acceptance Criteria`  [INFERRED] [semantically similar]
  agent/skills/ci-cd-and-automation/SKILL.md → PROMPT.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Vibecoder Trust and Ownership Loop** — prompt_vibecoder_differentiation_trust_loop, landing_copy_trust_features, prompt_vibecoder_generation_pipeline, docs_superpowers_specs_2026_09_23_vibecoder_projects_routes_transactional_change_flow, prompt_vibecoder_quality_bar [INFERRED 0.85]
- **Agent Quality Feedback Loop** — agent_skills_ci_cd_and_automation_skill_quality_gate_pipeline, agent_skills_code_review_and_quality_skill_five_axis_review, agent_skills_debugging_and_error_recovery_skill_systematic_triage, agent_skills_context_engineering_skill_durable_session_handoff, agent_skills_code_review_and_quality_skill_verification_evidence [INFERRED 0.75]
- **Explicit Interface and Boundary Pattern** — agent_skills_api_and_interface_design_skill_contract_first, agent_skills_api_and_interface_design_skill_boundary_validation, docs_superpowers_specs_2026_09_23_code_replica_design_shared_pty_transport, docs_superpowers_specs_2026_09_23_vibecoder_projects_routes_session_ownership_model, agent_skills_context_engineering_skill_untrusted_external_context [INFERRED 0.75]
- **Evidence-Backed Agent Skill Lifecycle** — agent_skills_interview_me_skill_statement_of_intent, agent_skills_spec_driven_development_skill_gated_specify_plan_tasks_implement, agent_skills_planning_and_task_breakdown_skill_acceptance_criteria_tasks, agent_skills_incremental_implementation_skill_thin_vertical_slices, agent_skills_observability_and_instrumentation_skill_red_use_metrics, agent_skills_doubt_driven_development_skill_fresh_context_adversarial_review, agent_skills_test_driven_development_skill_red_green_refactor, agent_skills_git_workflow_and_versioning_skill_atomic_commits, agent_skills_documentation_and_adrs_skill_architecture_decision_records, agent_skills_shipping_and_launch_skill_reversible_incremental_launch [EXTRACTED 1.00]
- **Code Replica PTY Delivery Architecture** — docs_superpowers_plans_2026_09_23_code_replica_transport_abstraction, docs_superpowers_plans_2026_09_23_code_replica_pty_backed_opencode, docs_superpowers_plans_2026_09_23_code_replica_dual_surface_delivery, docs_superpowers_plans_2026_09_23_code_replica_security_and_failure_constraints [EXTRACTED 1.00]
- **Evidence-Backed Launch Flow** — agent_skills_performance_optimization_skill_measure_identify_fix_verify, agent_skills_observability_and_instrumentation_skill_instrumentation_questions, agent_skills_observability_and_instrumentation_skill_red_use_metrics, agent_skills_test_driven_development_skill_prove_it_pattern, agent_skills_shipping_and_launch_skill_metric_threshold_rollback, agent_skills_shipping_and_launch_skill_reversible_incremental_launch [INFERRED 0.85]

## Communities (46 total, 5 thin omitted)

### Community 0 - "AI Model Execution Engine"
Cohesion: 0.05
Nodes (66): vitest, makeAgent(), buildFileList(), compactSource(), DEFAULT_MAX_OUTPUT_TOKENS, envNameFor(), fixHintFor(), httpError() (+58 more)

### Community 1 - "Authentication, Wallets, and Navigation"
Cohesion: 0.05
Nodes (51): nextConfig, lucide-react, next, ref_node_crypto, metadata, AppHomePage(), greeting(), metadata (+43 more)

### Community 2 - "Transactional Project Change API"
Cohesion: 0.07
Nodes (40): ProjectPage(), DELETE(), GET(), POST(), POST(), POST(), POST(), POST() (+32 more)

### Community 3 - "Updater Artifacts and Migrations"
Cohesion: 0.07
Nodes (33): @libsql/client, ref_node_fs, ref_node_module, ref_node_path, ref_node_url, prisma, dir, from (+25 more)

### Community 4 - "Project Builder and Integrations"
Cohesion: 0.06
Nodes (28): diff, @monaco-editor/react, FileEditor(), LANG_BY_EXT, languageFor(), MonacoEditor, IntegrationsPanel(), Attachment (+20 more)

### Community 5 - "Payments, Credits, and Licensing"
Cohesion: 0.10
Nodes (31): stripe, POST(), POST(), deliverLicenseEmail(), POST(), POST(), CopyButton(), metadata (+23 more)

### Community 6 - "Package Dependencies and Tooling"
Cohesion: 0.05
Nodes (41): eslintConfig, dependencies, diff, esbuild-wasm, @libsql/client, lucide-react, @monaco-editor/react, next (+33 more)

### Community 7 - "Product Specifications and Releases"
Cohesion: 0.05
Nodes (42): Boundary Validation, Contract-First Interface Design, Idempotency and Unknown Outcomes, Clean Runtime Acceptance Bar, Browser Runtime Verification Workflow, Staged Deployment and Rollback, Environment and Secret Management, Automated Quality Gate Pipeline (+34 more)

### Community 8 - "Prompt, Models, and Settings"
Cohesion: 0.09
Nodes (27): Attachment, HomeComposer(), submit(), Mode, MODES, nameFromPrompt(), ModelPicker(), rowOverlay() (+19 more)

### Community 9 - "Provider Keys and Readiness"
Cohesion: 0.17
Nodes (17): ref_node_http, ref_node_net, DELETE(), GET(), POST(), checkFreeReadiness(), invalidateReadiness(), ANSWER (+9 more)

### Community 10 - "TypeScript Compiler Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 11 - "Project Development Server"
Cohesion: 0.21
Nodes (15): ref_child_process, ref_fs, ref_path, DELETE(), GET(), POST(), ensureProjectDir(), getNextPort() (+7 more)

### Community 12 - "Development Tooling Dependencies"
Cohesion: 0.12
Nodes (16): devDependencies, eslint, eslint-config-next, jsdom, prisma, tailwindcss, @tailwindcss/postcss, @testing-library/dom (+8 more)

### Community 13 - "Live Preview Build Pipeline"
Cohesion: 0.19
Nodes (10): esbuild-wasm, buildPreview(), CDN, errmsg(), Files, findEntry(), loadEsbuild(), norm() (+2 more)

### Community 14 - "Performance Observability and Rollback"
Cohesion: 0.20
Nodes (14): Distributed Tracing, Observability and Instrumentation Skill Guide, On-Call Instrumentation Questions, RED and USE Metrics, Core Web Vitals Targets, Performance Optimization Skill Guide, Measure Identify Fix Verify, N+1 Query Elimination (+6 more)

### Community 15 - "Animated Video Intro"
Cohesion: 0.20
Nodes (11): @testing-library/react, AMP_TIMES, AMP_VALUES, easedSeg(), Phase, SAG, sampleAmp(), mountIntro() (+3 more)

### Community 16 - "Safe Migrations and Vertical Slices"
Cohesion: 0.15
Nodes (13): Code Is a Liability, Deprecation and Migration Skill Guide, Safe Incremental Migration, Strangler Pattern, Architecture Decision Records, ADR Lifecycle, Decision Rationale, Documentation and ADRs Skill Guide (+5 more)

### Community 17 - "Security Hardening and Source Verification"
Cohesion: 0.18
Nodes (13): Structured Correlation Logging, Hardening Patterns Guide, Parameterized Queries, Secure Session Cookies, SSRF Defense, Security and Hardening Skill Guide, Supply Chain Hardening, Threat Model First (+5 more)

### Community 18 - "VibeCoder Brand Icon Assets"
Cohesion: 0.26
Nodes (13): Abstract Diagonal Ribbon Mark, VibeCoder Favicon PNG Asset, Browser Site Identification, Monochrome Dark-Gray Design, VibeCoder Brand Mark, VibeCoder Logo Asset, VibeCoder Application Icon, Compact Web Brand Icon (+5 more)

### Community 19 - "Test-Driven Planning and Review"
Cohesion: 0.18
Nodes (11): Claim Extract Doubt Cycle, Cross-Model Review Escalation, Fresh-Context Adversarial Review, Doubt-Driven Development Skill Guide, Acceptance-Criteria Tasks, Dependency Graph, Planning and Task Breakdown Skill Guide, Test-Driven Development Skill Guide (+3 more)

### Community 20 - "Git Workflows and Desktop Updates"
Cohesion: 0.20
Nodes (11): Atomic Commits, Git Workflow and Versioning Skill Guide, Short-Lived Feature Branches, Trunk-Based Development, Feature Flag Rollout, Reversible Incremental Launch, Desktop Auto-Updates Guide, Pro Beta Channel Gating (+3 more)

### Community 21 - "Site Metadata and SEO"
Cohesion: 0.24
Nodes (4): src_app_globals, metadata, siteConfig, siteUrl

### Community 22 - "Terminal Replica and Animation"
Cohesion: 0.20
Nodes (10): Component Composition, Opencode Replica Implementation Plan, PTY-Backed Opencode, Replica Security and Failure Constraints, Transport Abstraction, Deterministic Animation Timeline, Vibecoder Promotional Animation, Particle Globe (+2 more)

### Community 23 - "New Project, Chat, and Upgrades"
Cohesion: 0.20
Nodes (4): react, NewProjectForm(), TerminalChat(), UpgradeCard()

### Community 24 - "Desktop Download Selector"
Cohesion: 0.29
Nodes (8): clientSubscribe(), DESKTOP_PLATFORMS, detectPlatform(), DownloadButtons(), getServerSnapshot(), Platform, RELEASES_BASE, useDetectedPlatform()

### Community 25 - "Homepage Marketing and Chat"
Cohesion: 0.25
Nodes (5): TerminalChat(), faqs, jsonLd, pillars, TerminalChat

### Community 26 - "Debugging and Code Simplification"
Cohesion: 0.25
Nodes (8): Structural Review Remedies, Verification Evidence in Review, Incremental Simplification Process, Scoped Simplification and Dead Code Hygiene, Selective Context Packing, Root-Cause Fix and Regression Guard, Stop-the-Line Debugging Workflow, Systematic Error Triage

### Community 27 - "Pricing UI Design System"
Cohesion: 0.29
Nodes (8): Design System Adherence, Frontend UI Engineering Skill Guide, Reference-Led Design Contract, Billing Plan Comparison, Credit Meter States, Credits Cost Simulator, Pricing and Credits Mockup, Responsive Accessible Pricing UI

### Community 28 - "Interactive Idea Refinement"
Cohesion: 0.25
Nodes (8): Ideation Session Examples, Selective Ideation Lenses, Assumption Audit, User Value, Feasibility, Differentiation Rubric, MVP Scoping Principles, Interactive User Requirement Discovery, Idea Refine One-Pager Artifact, Idea Refine Three-Phase Workflow

### Community 29 - "Requirements Interviews and Specs"
Cohesion: 0.29
Nodes (8): Interview Me Skill Guide, Ninety-Five Percent Confidence Gate, One-Question Interview, Confirmed Statement of Intent, Capability Map, Gated Specify Plan Tasks Implement, Spec-Driven Development Skill Guide, Human Review Gates

### Community 30 - "Animated Globe Background"
Cohesion: 0.39
Nodes (7): three, CITIES, GlobeBackground(), latLonToVec3(), makeArc(), makeGlowTexture(), resolveAccent()

### Community 31 - "Vercel Logo Asset"
Cohesion: 0.33
Nodes (6): Vercel Logo SVG Asset, Dark-Background Display Context, Vercel Triangle Logomark, Public Static Web Asset, Transparent SVG Canvas, White Upward-Pointing Triangle

### Community 32 - "Homepage Route and Wrapper"
Cohesion: 0.40
Nodes (3): metadata, HomeClient, HomeClientWrapper()

### Community 33 - "Generic File Icon Asset"
Cohesion: 0.40
Nodes (5): File Document Icon, Document Symbol, Folded Corner Detail, Generic File Interface Indicator, Text Line Motif

### Community 34 - "Social Preview Image"
Cohesion: 0.40
Nodes (3): alt, contentType, size

### Community 35 - "Globe Icon Asset"
Cohesion: 0.50
Nodes (4): Globe SVG Asset, Compact Interface Icon, Globe Grid Design, Worldwide Representation

### Community 36 - "Next.js Logo Asset"
Cohesion: 0.67
Nodes (4): NEXT.js SVG Logo Asset, Next.js Brand Identification, Black Monochrome Brand Styling, NEXT.js Wordmark

### Community 37 - "Untrusted External Content Boundaries"
Cohesion: 0.67
Nodes (3): Untrusted Browser Content Boundary, Untrusted External Context, Untrusted Error Output

### Community 38 - "Quality Floor Guardrails"
Cohesion: 0.67
Nodes (3): Diff-Scoped Floor Guard, Five Cheap-Road-to-Green Moves, Guard the Quality Bar

### Community 39 - "Agent Coding Rule Hierarchy"
Cohesion: 0.67
Nodes (3): Context Hierarchy, Next.js Breaking-Changes Rules, CLAUDE.md Rules Reference

### Community 40 - "Window Icon Asset"
Cohesion: 1.00
Nodes (3): Window Icon, Window Frame, Three Header Control Dots

## Knowledge Gaps
- **208 isolated node(s):** `Pack`, `Reply`, `Seen`, `Theme`, `Platform` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 309 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Authentication, Wallets, and Navigation` to `Homepage Route and Wrapper`, `Transactional Project Change API`, `Social Preview Image`, `Project Builder and Integrations`, `Payments, Credits, and Licensing`, `Package Dependencies and Tooling`, `Prompt, Models, and Settings`, `Provider Keys and Readiness`, `Project Development Server`, `Site Metadata and SEO`, `New Project, Chat, and Upgrades`, `Homepage Marketing and Chat`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `vitest` connect `AI Model Execution Engine` to `Updater Artifacts and Migrations`, `Project Builder and Integrations`, `Package Dependencies and Tooling`, `Prompt, Models, and Settings`, `Provider Keys and Readiness`, `Animated Video Intro`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `react` connect `New Project, Chat, and Upgrades` to `Authentication, Wallets, and Navigation`, `Transactional Project Change API`, `Project Builder and Integrations`, `Payments, Credits, and Licensing`, `Package Dependencies and Tooling`, `Prompt, Models, and Settings`, `Live Preview Build Pipeline`, `Animated Video Intro`, `Desktop Download Selector`, `Homepage Marketing and Chat`, `Animated Globe Background`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `Pack`, `Reply`, `Seen` to the rest of the system?**
  _208 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Model Execution Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.050686641697877656 - nodes in this community are weakly interconnected._
- **Should `Authentication, Wallets, and Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.0533515731874145 - nodes in this community are weakly interconnected._
- **Should `Transactional Project Change API` be split into smaller, more focused modules?**
  _Cohesion score 0.07138047138047138 - nodes in this community are weakly interconnected._