// Central env access. Stripe is optional at dev time; the site renders and
// functions fully without it — upgrade buttons show a kind notice instead.
//
// Two key sets:
//  - LIVE: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_PRO (real money)
//  - TEST: STRIPE_TEST_SECRET_KEY / STRIPE_TEST_WEBHOOK_SECRET / STRIPE_TEST_PRICE_PRO
//
// When a test set is present, visitors can run the full checkout with
// Stripe's test card 4242 4242 4242 4242 — no real money moves, and the
// license issued is marked test-mode.

export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  live: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    pricePro: process.env.STRIPE_PRICE_PRO ?? "",
  },
  test: {
    secretKey: process.env.STRIPE_TEST_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET ?? "",
    pricePro: process.env.STRIPE_TEST_PRICE_PRO ?? "",
  },
};

export type StripeMode = "live" | "test";

export interface StripeSet {
  secretKey: string;
  webhookSecret: string;
  pricePro: string;
}

/** Live is usable only when all three vars are set; same for test. */
export const liveEnabled = Boolean(
  env.live.secretKey && env.live.webhookSecret && env.live.pricePro,
);
export const testEnabled = Boolean(
  env.test.secretKey && env.test.webhookSecret && env.test.pricePro,
);

export function keySetFor(mode: StripeMode): StripeSet {
  return mode === "test" ? env.test : env.live;
}
