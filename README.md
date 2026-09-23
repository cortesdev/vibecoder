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

## Releases

Download links point at `/releases/Vibecoder-<version>-<platform>` paths —
point them at GitHub Releases or object storage when binaries exist. The
platform list and OS detection live in
`src/components/download-buttons.tsx`.
