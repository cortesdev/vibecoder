import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { keySetFor, liveEnabled, testEnabled, type StripeMode } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`checkout:${ip}`, 10, 60_000).ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a minute." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    mode?: string;
  };
  const requested: StripeMode = body.mode === "test" ? "test" : "live";

  if (requested === "test" && !testEnabled) {
    return NextResponse.json(
      { error: "Demo checkout isn't set up right now. Come back soon!" },
      { status: 503 },
    );
  }
  if (requested === "live" && !liveEnabled) {
    return NextResponse.json(
      {
        error:
          "Checkout isn't switched on yet. The free app needs no license — Pro upgrades will be available soon.",
      },
      { status: 503 },
    );
  }

  const stripe = getStripe(requested);
  if (!stripe) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const set = keySetFor(requested);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment", // one-time license, not a subscription
    line_items: [{ price: set.pricePro, quantity: 1 }],
    customer_email: body.email || undefined,
    // The license key is delivered via the webhook and shown on the success
    // page. Test-mode sessions are labeled so success/support can tell.
    metadata: { product: "vibecoder-pro", checkoutMode: requested },
    success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}&mode=${requested}`,
    cancel_url: `${origin}/#upgrade`,
  });

  return NextResponse.json({ url: session.url, mode: requested });
}
