import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";

const FAKE = {
  googleSub: "fake-dev-user",
  email: "dev@vibecoder.local",
  name: "Dev User",
  image: "",
};

// Dev-only: GET /api/dev/fake-login → upserts a fake user, sets vibecoder_session, redirects to /agent
// Blocked in production unless ALLOW_FAKE_LOGIN=true is set (temporary testing only).
export async function GET(req: Request) {
  const isProd = (process.env.NODE_ENV as string | undefined) === "production";
  const allowProd = process.env.ALLOW_FAKE_LOGIN === "true";
  if (isProd && !allowProd) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (req.headers.get("x-fake-login-token") !== process.env.FAKE_LOGIN_TOKEN) {
    // Also allow `?token=` for quick manual testing when the header can't be set
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!token || token !== process.env.FAKE_LOGIN_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const user = await db.user.upsert({
    where: { googleSub: FAKE.googleSub },
    create: FAKE,
    update: FAKE,
  });
  const sessionToken = await createSession(user.id);

  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/agent";
  // Support relative `?next=/agent` on both dev and prod (don't rely on NEXT_PUBLIC_SITE_URL).
  const redirectTo = next.startsWith("/") ? `${url.origin}${next}` : next;

  const res = NextResponse.redirect(redirectTo);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: isProd, // must be true on https (prod), false on http (localhost)
  });
  return res;
}
