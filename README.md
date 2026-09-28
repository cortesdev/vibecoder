# vibecoder.io — download site + license service

**The AI coding agent that lives on your desktop.** This repo builds
vibecoder.io: a single-page marketing + download site for the Vibecoder
desktop coding agent, plus the Stripe checkout and license service behind the
optional $49 Pro upgrade.

The product itself — the Vibecoder desktop app and CLI (an OpenCode-style
coding agent with BYO keys, plan/build modes, and /undo) — lives in its own
repository.

## The stack

Next.js 16 (App Router) + Tailwind 4. Static-first marketing page; four
server routes handle money and licenses. SQLite (via Prisma 7 + libsql)
stores licenses with zero-setup.

```
src/app/page.tsx                     landing: hero, session demo, downloads, upgrade, FAQ
src/app/upgrade/success/page.tsx     post-checkout: Stripe-verified license display
src/app/api/upgrade/checkout         creates a one-time Stripe Checkout session (live or demo)
src/app/api/stripe/webhook           fulfills licenses on checkout.session.completed; revokes on refund
src/app/api/license/validate         desktop app checks a key and activates a machine
src/lib/licenses.ts                  deterministic keys, idempotent fulfillment, machine limit
```

## Develop

```bash
pnpm install
npx prisma migrate deploy   # creates ./licenses.db
pnpm dev                    # http://localhost:3000
```

The site is fully functional with no env vars at all — the upgrade card
explains that checkout isn't switched on yet, and everything else works.

## Verify

```bash
pnpm lint && npx tsc --noEmit && pnpm build
```

## Stripe setup

Two independent key sets. Each mode activates only when its full trio is
present.

### Live purchases (real money)

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PRO=price_…        # one-time $49 price, "Vibecoder Pro"
NEXT_PUBLIC_SITE_URL=https://vibecoder.io
```

One-time setup in the Stripe dashboard: create a **product** "Vibecoder Pro"
with a **one-time price** of $49, copy its `price_…` id. Add a webhook
endpoint pointing at `https://vibecoder.io/api/stripe/webhook` subscribed to
`checkout.session.completed` and `charge.refunded`, copy its signing secret.

### Demo purchases (no money moves)

```
STRIPE_TEST_SECRET_KEY=sk_test_…
STRIPE_TEST_WEBHOOK_SECRET=whsec_…
STRIPE_TEST_PRICE_PRO=price_…   # $49 one-time price in test mode
```

When these exist, the upgrade card grows a **"Try the flow (demo)"** toggle.
It opens real Stripe Checkout in test mode — visitors use the test card
`4242 4242 4242 4242`, any future expiry, any CVC. Fulfillment is identical
to a live purchase, but the key is prefixed `TEST-` and every surface labels
it as a demo. Refunds revoke licenses the same way.

For local testing, forward events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### License delivery

Fulfillment is idempotent per Stripe session (unique constraint +
deterministic key derivation, so webhook retries are safe). Keys are shown on
`/upgrade/success` immediately. Email delivery is the one open integration
point — see `deliverLicenseEmail` in the webhook route.

## License validation contract (desktop app)

```
POST /api/license/validate
{ "key": "VBC-…", "machineId": "<stable fingerprint>", "label": "MacBook Pro" }
→ { "ok": true,  "email": "buyer@…", "machines": 3 }
→ { "ok": false, "reason": "not_found" | "revoked" | "limit_reached" }
```

Omit `machineId` for startup validation; include it to activate a new
machine. Limit: 10 machines per license. Machine fingerprints are hashed
before storage. Rate limit: 30/min/IP.

## Model providers (which free LLM answers the first prompt)

Free models are wired so the very first prompt works: the engine walks the free
registry and runs the first model that has a key — the user's own (Settings →
API keys) or the platform's env var.

| Model | Provider | Platform env var | Notes |
| --- | --- | --- | --- |
| OpenRouter Free (default) | OpenRouter | `OPENROUTER_API_KEY` | `openrouter/free` alias, 50 req/day per key |
| GPT-OSS 120B | Groq | `GROQ_API_KEY` | free plan with limits |
| Cerebras Llama 70B | Cerebras | `CEREBRAS_API_KEY` | free plan, fastest fallback |
| GLM Flash | Z.ai | `ZAI_API_KEY` | `glm-4.5-flash` priced at $0 |
| HF GPT-OSS 120B | Hugging Face | `HF_TOKEN` | router free credit, small monthly budget |
| Nemotron | NVIDIA NIM | `NVIDIA_API_KEY` | trial endpoint limits |
| Gemini Flash | Google | `GEMINI_API_KEY` | free tier with quotas, tried last (503s under load) |
| Claude / GPT | Anthropic, OpenAI | `VIBECODER_ANTHROPIC_API_KEY`, `VIBECODER_OPENAI_API_KEY` | credits tier |

**Do not use an OpenCode Zen key for free models.** Zen gates its free tier to
the OpenCode app itself; every other caller — including your own server with a
valid key — gets `403 FreeTierError: "OpenCode's free tier can only be used from
within OpenCode"`. Zen's *paid* models do work from a server (they need account
funds), so `OPENCODE_API_KEY` is only useful for those. Failures now surface the
provider's own message, so a provider gate reads as a sentence rather than
`agent API responded 403`.

A rotated upstream model id is an env change, not a deploy:
`VIBECODER_MODEL_GEMINI_FLASH=gemini-3.8-flash`.

## Releases

`v*` tags publish installers from GitHub Actions
(`.github/workflows/release.yml`): each OS builds and signs its bundles,
`scripts/updater-artifacts.mjs` renames them to the canonical asset names the
update feed serves, and the run creates one release with `latest.json`.
Prereleases (`v1.2.0-beta.1`) stay out of `releases/latest`.

Required secret: `TAURI_SIGNING_PRIVATE_KEY` (updater signature — the app
refuses unsigned updates). Optional: Apple signing/notarization secrets and
`WINDOWS_CERTIFICATE`/`WINDOWS_CERTIFICATE_PASSWORD`. The workflow fails with an
explanation when the Tauri shell (`src-tauri/`) is missing or its version does
not match the tag.

Download links are built from `NEXT_PUBLIC_RELEASES_BASE_URL` (default: this
repo's `releases/latest/download`) plus the canonical asset names in
`src/components/download-buttons.tsx`. A private repo serves those assets only
to signed-in users — make the repo public or point that env var at a CDN before
launching the download page.

### Provider reliability

Generation retries HTTP 429, 500, 502, 503 and 504 up to three total attempts,
with exponential backoff and jitter. A provider's `Retry-After` is respected;
waits longer than five seconds end that provider attempt instead of retrying
prematurely. Each provider has a 45-second total budget, including response
reading and waits. Network failures/timeouts are not replayed automatically
because the provider may already have processed the request.

Free requests then try the other configured free provider. Missing keys are
skipped; a free request never switches to a paid model. No automatic fallback
can help when the only configured provider is unavailable. The prompt route
requests a 120-second deployment timeout for the two-provider path; check
that your hosting plan supports it.

Overload, quota, authentication and billing errors have distinct messages.
Failed or unusable model responses do not start the free cooldown or spend
free tokens; failed paid generation follows the existing credit-refund path.
These are app accounting rules, not a guarantee that a provider bills nothing
for failed requests. Provider account access, quotas and prices still apply.
