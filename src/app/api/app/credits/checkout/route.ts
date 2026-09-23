import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { liveEnabled, testEnabled, type StripeMode } from "@/lib/env";
import { CREDIT_PACKS } from "@/lib/credits";
import { rateLimit } from "@/lib/ratelimit";

// Buy a credit pack. Requires sign-in (credits belong to a user, not an
// email). Test mode available when the STRIPE_TEST_* trio is configured.

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`credits:${ip}`, 10, 60_000).ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { pack?: number; mode?: string };
  const pack = CREDIT_PACKS.find((p) => p.credits === body.pack);
  if (!pack) return NextResponse.json({ ok: false, error: "unknown pack" }, { status: 400 });

  const requested: StripeMode = body.mode === "test" ? "test" : "live";
  const enabled = requested === "test" ? testEnabled : liveEnabled;
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Checkout isn't switched on yet — credits purchase coming soon." },
      { status: 503 },
    );
  }

  const stripe = getStripe(requested);
  if (!stripe) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  // Credit-pack Prices must be created in Stripe with matching metadata; the
  // price IDs are wired per pack via env (comma-ordered with CREDIT_PACKS).
  const priceId = process.env[`STRIPE_PRICE_CREDITS_${pack.credits}`];
  if (!priceId) {
    return NextResponse.json(
      { ok: false, error: "This pack isn't wired up yet." },
      { status: 503 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    metadata: {
      product: "vibecoder-credits",
      userId: user.id,
      credits: String(pack.credits),
      checkoutMode: requested,
    },
    success_url: `${origin}/app?credits=${pack.credits}`,
    cancel_url: `${origin}/app/settings`,
  });

  return NextResponse.json({ ok: true, url: session.url });
}
