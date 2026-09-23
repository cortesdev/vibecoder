import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SiteNav from "@/components/site-nav";
import { currentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/agent");

  const { error } = await searchParams;
  const messages: Record<string, string> = {
    not_configured:
      "Google sign-in isn't configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.",
    state: "The sign-in link expired. Please try again.",
    callback: "Google sign-in didn't complete. Please try again.",
    email_not_verified: "That Google account's email isn't verified.",
  };

  return (
    <>
      <SiteNav />
      <main id="main" className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="card w-full max-w-sm p-8 text-center">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">Sign in to Vibecoder</h1>
          <p className="mt-2 text-sm muted">
            Sign in with Google to create projects and use the agent.
          </p>

          {error && (
            <p role="alert" className="notice-reveal mt-4 rounded-lg p-3 text-left text-sm" style={{ background: "rgba(232,72,63,0.12)", color: "var(--accent)" }}>
              {messages[error] ?? "Something went wrong. Please try again."}
            </p>
          )}

          {googleEnabled ? (
            <a href="/api/auth/google" className="btn btn-primary mt-6 w-full">
              Continue with Google
            </a>
          ) : (
            <p className="mt-6 rounded-lg p-3 text-sm muted" style={{ border: "1px solid var(--hairline)" }}>
              Sign-in is being configured. Check back soon.
            </p>
          )}

          <p className="mt-6 text-xs muted-3">
            New here? Signing in creates your account automatically.
          </p>
          <Link href="/" className="mt-2 block text-xs muted hover:opacity-70">
            Back to home
          </Link>
        </div>
      </main>
    </>
  );
}