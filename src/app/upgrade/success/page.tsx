import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { liveEnabled, testEnabled } from "@/lib/env";
import CopyButton from "./copy-button";
import SiteNav from "@/components/site-nav";

export const metadata = { robots: { index: false } };

export default async function UpgradeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; mode?: string }>;
}) {
  const { session_id: sessionId, mode: modeParam } = await searchParams;
  const requestedMode = modeParam === "test" ? "test" : "live";

  let licenseKey: string | null = null;
  let email: string | null = null;
  let isTest = false;
  let error: string | null = null;
  let paid = false;

  // Server-side verification: the session_id in the URL is untrusted input.
  // Look it up with Stripe directly (using the key set matching the checkout
  // mode), and only then read the license row.
  if (!sessionId) {
    error = "No checkout session found. If you just paid, check your email for the license key.";
  } else {
    const stripe = getStripe(requestedMode);
    const configured = requestedMode === "test" ? testEnabled : liveEnabled;

    if (stripe && configured) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        paid = session.payment_status === "paid";
        if (!paid) {
          error =
            "That checkout isn't complete yet. If you just paid, give it a moment and refresh.";
        }
      } catch {
        error =
          "We couldn't verify that checkout session. Check your email for the license key, or contact hello@vibecoder.io.";
      }
    }

    if (!error) {
      try {
        const license = await db.orm.public.License
          .where({ stripeSessionId: sessionId })
          .first();
        if (license) {
          licenseKey = license.key;
          email = license.email;
          isTest = license.key.startsWith("TEST-");
        } else if (paid) {
          // Payment verified with Stripe; webhook fulfillment hasn't landed yet.
          error =
            "Your payment went through — your license is being finalized. Refresh in a moment.";
        } else {
          error =
            "We couldn't find that checkout session. Check your email for the license key.";
        }
      } catch {
        error = "Something went wrong on our side. Nothing is lost — email hello@vibecoder.io.";
      }
    }
  }

  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto w-full max-w-[560px] px-6 py-20">
        <p className="eyebrow">{isTest ? "Demo purchase — no money moved" : "Payment received"}</p>
        <h1 className="display mt-3 text-[2.4rem]">
          {isTest ? "That's the whole flow." : "Thank you. Seriously."}
        </h1>
        <p className="muted mt-4">
          {isTest
            ? "You just ran the exact purchase flow a real buyer gets: Stripe checkout, license generation, activation. The only difference: the test card and a TEST- prefix on the key."
            : email
              ? `Your Pro license is active${email !== "unknown" ? ` for ${email}` : ""}. It never expires, works on up to 10 machines, and there's nothing to cancel.`
              : "Your Pro license is being finalized."}
        </p>

        {licenseKey && (
          <div className="card mt-8 p-6">
            <p className="muted-3 text-[13px] font-semibold uppercase tracking-wide">
              {isTest ? "Demo license key" : "License key"}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <code
                className="mono flex-1 overflow-x-auto rounded-lg px-3 py-2.5 text-[14px]"
                style={{ background: "var(--bg-inset)" }}
              >
                {licenseKey}
              </code>
              <CopyButton text={licenseKey} />
            </div>
            <p className="muted-3 mt-3 text-[13px]">
              {isTest
                ? "This key validates against the same endpoint a real key does — but it's marked demo and can't be mistaken for a purchase."
                : `Also sent to ${email}. Keep it somewhere safe — it's the only proof of purchase.`}
            </p>
          </div>
        )}

        {error && (
          <p
            className="mt-8 rounded-xl p-4 text-sm"
            style={{ background: "var(--bg-inset)", color: "var(--ink-2)" }}
            role="status"
          >
            {error}
          </p>
        )}

        <div className="mt-10">
          <h2 className="text-[17px] font-semibold">Next steps</h2>
          <ol className="muted mt-3 flex flex-col gap-2.5 text-[15px]" role="list">
            <li>1. Open Vibecoder and go to Settings → License.</li>
            <li>2. Paste your key and activate. That&rsquo;s it.</li>
            {isTest ? (
              <li>3. Like it? The real one is a click away — same page, &ldquo;Buy for real.&rdquo;</li>
            ) : (
              <li>3. Beta builds appear under Check for Updates → Beta channel.</li>
            )}
          </ol>
        </div>

        <p className="muted-3 mt-10 text-[13px]">
          Questions or a refund? One email: hello@vibecoder.io. 30 days, no
          questions asked.
        </p>
      </main>
    </>
  );
}
