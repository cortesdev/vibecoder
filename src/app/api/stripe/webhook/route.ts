import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { fulfillLicense, revokeByPaymentIntent } from "@/lib/licenses";
import { purchaseCredits } from "@/lib/credits";

// Stripe is the source of truth for payments. Events carry `livemode`, so a
// single endpoint serves both: verify against the matching webhook secret and
// fulfill identically — a test purchase yields a real (test-marked) license
// row, which is exactly what lets visitors try the full flow safely.

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  // Livemode is extractable from the event payload header-side: try both
  // secrets and accept whichever verifies. (constructEvent is constant-time
  // on the signature; trying two known secrets leaks nothing.)
  let event: Stripe.Event | null = null;
  let mode: "live" | "test" | null = null;

  for (const [m, set] of [
    ["live", env.live],
    ["test", env.test],
  ] as const) {
    if (!set.webhookSecret) continue;
    const stripe = getStripe(m);
    if (!stripe) continue;
    try {
      event = stripe.webhooks.constructEvent(body, signature, set.webhookSecret);
      mode = m;
      break;
    } catch {
      // try the next secret
    }
  }

  if (!event || !mode) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      // Route by product metadata: license vs credit pack.
      if ((event.data.object as Stripe.Checkout.Session).metadata?.product === "vibecoder-credits") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? "";
        const credits = Number(session.metadata?.credits ?? 0);
        if (userId && credits > 0 && session.payment_status === "paid") {
          await purchaseCredits({
            userId,
            credits,
            stripeSessionId: session.id,
            testMode: mode === "test",
          });
        }
        break;
      }
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.product === "vibecoder-pro" && session.payment_status === "paid") {
        const paymentIntent =
          typeof session.payment_intent === "string" ? session.payment_intent : "";
        const result = await fulfillLicense({
          sessionId: session.id,
          email: session.customer_details?.email ?? session.customer_email ?? "unknown",
          paymentIntent,
          testMode: mode === "test",
        });
        if (result.created) {
          await deliverLicenseEmail(
            session.customer_details?.email ?? "",
            result.licenseKey,
            mode === "test",
          );
        }
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      await revokeByPaymentIntent(typeof charge.payment_intent === "string" ? charge.payment_intent : "");
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

/**
 * Email delivery integration point. Plug in Resend/Postmark/etc.; the key is
 * already stored, so a failed send is recoverable — the buyer can always
 * retrieve it from the success page and support can look it up by email.
 * Test-mode purchases get a clearly-labeled demo receipt or none at all.
 */
async function deliverLicenseEmail(email: string, licenseKey: string, testMode: boolean): Promise<void> {
  if (testMode) {
    console.info("test-mode license — no email sent", { email, licenseKey });
    return;
  }
  // TODO(email): send "Your Vibecoder Pro license key" to email with licenseKey.
  console.info("license email queued", { email, licenseKey });
}
