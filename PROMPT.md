# PROMPT.md — build Vibecoder.io

Paste everything below the divider into a fresh agent session in this repo (or copy it anywhere — it's self-contained).

---

## Mission

Build **Vibecoder.io** — a web SaaS where anyone types an idea and gets a real, running app. One product, done exceptionally well: the AI web app builder. Every AI edit reviewable as a diff, reversible in one click, resumable after a crash.

**Do not try to win on "free."** Freebuff (freebuff.com) is a $0/yr ad-funded platform with 470k+ users and five free products. You win on **honesty, ownership, accessibility, and trust** — the things their ad-funded model structurally cannot offer.

You are not starting from zero. This repo is a Next.js 16 + React 19 + Tailwind 4 + Prisma + pnpm app. `prisma/schema.prisma` already models `Project`, `ProjectFile`, `Prompt`, `Change`, `ProjectVersion`, `Usage`, `Setting`, `License` — it needs the SaaS layer added (below). `src/app` is still the create-next-app scaffold; the product is yours to build.

## Know the competition (verified Sept 2026)

- **Freebuff** — $0/yr, funded by text ads. Five products: CLI agent, Desktop, **Web app builder** (prompt → live app on its own URL, managed hosting — our direct rival), Cloud IDE for GitHub repos, Chat. Daily "Freebucks" credit allowance refills at **midnight Pacific**, non-cumulative; strongest models (GPT-6 Luna, MiMo 2.6 Pro, Gemini 3.8 Flash) are **paid-plan only**; full mode only in "selected regions" — elsewhere a **limited mode** (~5 one-hour sessions/day, fewer models), with VPN detection. Vendor-managed model list that can change anytime. Privacy is a vendor promise, not an audit.
- Also in the ring: Lovable, Bolt.new, Replit, Base44 — all paid subscriptions with monthly credit anxiety.
- **Read:** daily-renewing credits are table stakes, not a moat. Regional gating, ads, model roulette, and opaque limits are the openings.

## Differentiation: how Vibecoder.io beats Freebuff Web

1. **No ads. Ever.** Their product shows ads to fund free usage. Ours is funded by Pro subscriptions and we say so plainly. No ad targeting, no data trail built to sell attention.
2. **Radical transparency.** Published credit price list for every action and model tier, shown *before* you spend. Credits reset at 00:00 **UTC** — the same hour for every human on earth. No region gating, no VPN detection, no "selected countries" fine print, no surprise model swaps. If we change pricing, we announce it and grandfather active projects.
3. **Ownership, not rental.** One-click **code export** (zip + git-ready folder) from every project, data export and account deletion in-app. Freebuff Web hosts your app; your code is only nominally yours. Ours: "Free as in yours."
4. **Accessibility-first output.** The apps Vibecoder generates meet WCAG 2.2 AA by construction — semantic HTML, keyboard operable, labeled, contrast-checked. No mainstream builder does this. The product UI itself is equally accessible (same bar), plain-language throughout, i18n-ready strings from day one. This is the wedge no one else owns.
5. **Trust loop.** The agent never edits silently. Every change lands as a proposed diff (Monaco diff view) before apply; one-click revert per change and per prompt; every prompt snapshots a `ProjectVersion`; applies are atomic — a failed generation leaves the last good state, never half-written. Competitors bury or skip this.
6. **Same daily mechanic, honest economics.** Daily credits like Freebuff's, but the free tier uses capable standard models (not crippled), and Pro buys a bigger grant + frontier models at a published price — instead of ads plus region luck.

## Product pillars

1. **Inclusive by default.** WCAG 2.2 AA for both the product and every app it generates (automated axe checks in CI + keyboard-only acceptance test). Plain-language UI, no dark patterns (pricing copy says in one sentence what canceling does). The free tier must be genuinely usable by a student with no card and no VPN — that's the inclusivity thesis.
2. **Credits that renew daily, honestly.** Every account gets a daily grant (00:00 UTC, non-cumulative). Credits are the only meter; different actions and model tiers cost different amounts, shown before you spend. Warn (never block) at 80% of the grant.
3. **Free tier + Pro on Stripe.** Free: daily grant, standard models, all core features — a real product, not a crippled demo. Pro (monthly/yearly): bigger daily grant, frontier models, priority queue. Checkout, portal, webhooks via Stripe; test-mode keys in dev.
4. **Free for the owner.** `role` on `User` (`owner | admin | user`); first signup matching `OWNER_EMAIL` becomes `owner`: unlimited credits, billing bypass, admin dashboard (usage, revenue, users). The builder uses their own product for $0.
5. **Speed to first working app.** Scaffold from proven templates (`nextjs | react | vue | html`), generate only what's unique. Target: signup → running preview ≤ 5 minutes on the free tier.
6. **Closed-loop preview.** Generated apps run in an embedded iframe against a managed, sandboxed server. Capture console errors and failed requests; the agent proposes fixes before showing the result.

## v1 scope — one product, ruthlessly

**In:** landing page (hero must land "Free as in yours" vs ad-funded rivals in one scroll), auth, dashboard, project CRUD, template scaffolding, prompt pipeline, diff review + apply/revert, version timeline, live preview + **shareable read-only preview link**, credits system + daily UTC renewal, Stripe Free→Pro checkout/portal/webhooks, code export (zip), owner/admin dashboard, usage UI, account deletion + data export, onboarding.

**Out (say no — Freebuff already spreads across five products; we win by being one excellent one):** CLI agent, desktop app, cloud IDE/GitHub-repo agent, chat, custom-domain publishing (v1.5: `*.vibecoder.io` subdomains first), teams/orgs, marketplace, mobile apps, i18n translations (scaffold only), BYOK, SSO.

## Data-model work (extend `prisma/schema.prisma`)

- Reconcile the version mismatch up front: `@prisma/client` ^7 vs `prisma` CLI `8.0.0-rc.15`. Pick one story, switch datasource to **postgres**, migrate, use a client singleton.
- **Multi-tenant:** add `User` (id, email, name, image, role, createdAt) and ownership (`userId`) on `Project` (cascade delete). Every query scoped by user; authorization enforced server-side on every route.
- **Auth:** choose what works with this Next.js version *after reading `AGENTS.md` and `node_modules/next/dist/docs/`* — e.g. Auth.js or hand-rolled httpOnly session cookies with a `Session` table. Magic-link email or Google OAuth; verify Next 16 compatibility before committing.
- **Credits:** replace `Usage` with an append-only `CreditLedger` (userId, delta, reason: `daily_grant | generation | review | revert_refund | admin_grant`, balanceAfter, promptId?, createdAt). Balances derived/checked in a single Prisma transaction so concurrent requests can't double-spend. Debit *before* the LLM call; refund on failure.
- **Daily renewal without cron:** lazy grant — on first credit-touch of a UTC day, if the user's last `daily_grant` is older than today, insert today's grant. No scheduler.
- **Billing:** `Subscription` (userId, plan `free|pro`, status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd); replaces `License`. Stripe webhooks are the source of truth for plan changes.
- `Setting` stays for app config; the credit price list lives in versioned code config (one file, published to the pricing page from the same source of truth).

## Credit economics (starting numbers; configurable, published)

- Grant: Free **30 credits/day**; Pro **300 credits/day**. Reset 00:00 UTC.
- Costs: small edit 1, standard generation 5, planning/architecture 15, preview-fix loop 2. Frontier-tier models cost 2× and are Pro-only.
- Owner/admin: bypass all debits.

## Architecture guidance

- Next.js App Router in `src/app`; server actions or route handlers for the pipeline; middleware for auth gates. `pnpm dev` works with Stripe + local Postgres (docker-compose or hosted dev DB) and a **deterministic mock agent** so the whole pipeline — credits, diffs, versions, preview — is demoable and testable with zero API keys and zero spend.
- Generation pipeline: `Prompt` (pending → running → completed/failed) → build directly → file ops recorded as `Change` rows → typecheck/build gate → `ProjectVersion` snapshot → preview refresh. Never start with a plan review. Only pause mid-build for a true blocker — a decision only the user can make — offering up to 3 concrete options (recommended first) plus free-text input, sparingly and never abruptly.
- One LLM interface, two adapters: platform-key provider (keys in env, server-only) and the mock. Model routing: cheap model for small edits, strong for planning — user-overridable, each tier priced in credits.
- Preview server = managed child process per running project, sandboxed: resolve all generated paths inside the project workspace (reject `..` traversal), never execute model output outside the preview sandbox, per-user concurrency limits, tear down on idle. Shareable preview links render read-only against this server.
- Rate-limit auth and generation endpoints; credit debits are immutable for support disputes.

## Quality bar (acceptance criteria)

- `pnpm lint` and `pnpm build` clean; TypeScript strict; a test runner (vitest) covering: signup → free grant → create project → prompt → changes applied → version snapshot → revert restores byte-identical files; and: credits hit zero → generation blocked with a kind message → next UTC day → grant renewed; and: exported zip builds and runs.
- Billing: webhook drives plan flips; downgraded users keep projects and drop to the free grant.
- Security: one user cannot read, write, or list another user's projects (tested); paths can't escape the sandbox.
- Accessibility: axe passes on every page; the full create→prompt→apply flow is operable by keyboard alone; generated apps pass the same axe checks.
- Kill the server mid-generation and reopen: project in its last good state, prompt resumable or clearly failed — never corrupt.

## Milestones (in order; verify each before moving on)

0. `git init` (no repo yet), reconcile Prisma, postgres datasource + migration, extend schema (User/auth/credits/subscription), base dark-mode shell with a11y baked in.
1. Auth + dashboard + project CRUD + template scaffolding into `ProjectFile` rows.
2. Credits system (ledger, lazy daily grant, atomic debit, owner bypass) + prompt pipeline with the mock agent.
3. Diff review UI (Monaco diff), revert per change/prompt, version timeline.
4. Stripe: Free→Pro checkout, customer portal, webhooks, plan-gated grants, pricing page rendered from the same config as the credit engine — with honest copy.
5. Real LLM adapter (platform keys) + model routing priced in credits.
6. Live preview: child-process server, iframe embed, console-error feedback loop, shareable read-only preview link.
7. Code export (zip + git-ready), owner/admin dashboard, account deletion + data export, onboarding tour, empty states, a README that sells the demo.

## Landing page & UI design skills

The landing page is the product's first impression — design it like it matters. On this machine, a shared skill library lives at `~/.agents/skills/` (91 skills). Before designing or building any UI, read the relevant `SKILL.md` files and follow them:

- **`apple-design`** — Apple's design language from the WWDC design talks: clarity/deference/depth, fluid spring motion, size-specific typography, translucent materials, the eight design principles. This is the visual and interaction standard for everything Vibecoder ships.
- **`find-animation-opportunities`** — where motion earns its place and where it must be rejected (frequency/purpose/speed/function gate). Use it before adding any animation to the landing page or product; expect more rejections than suggestions. Restraint fits the brand: calm, premium, honest.
- **`web-design-guidelines`** (Vercel's Web Interface Guidelines) — run it as the review pass on every page and component before calling UI work done.
- **`efecto-web-design`** — real-time design canvas (requires the Efecto MCP server; check for its tools). If available, use it to mock and iterate the landing page visually before implementing in Next.js. If the MCP server is unavailable, skip it — apply `apple-design` principles directly in code instead.

Repo-local skills in `agent/skills/` travel with the codebase and work on any machine; the `~/.agents/skills/` ones above are stronger for design and motion and should be preferred where installed.

## Rules of engagement

- Write a todo plan first; work milestone by milestone; verify with build/tests before moving on.
- Check `agent/skills/` — the repo ships playbooks (spec-driven-development, incremental-implementation, test-driven-development, frontend-ui-engineering, security-and-hardening). Use them.
- For any UI build or review, also apply the design skills listed above (`apple-design`, `find-animation-opportunities`, `web-design-guidelines`, `efecto-web-design` when available).
- Fewest changes that work; edit before create; don't commit unless asked.
