import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { env } from "@/lib/env";

const FAKE = {
  googleSub: "fake-dev-user",
  email: "dev@vibecoder.local",
  name: "Dev User",
  image: "",
};

// Dev-only: GET /api/dev/fake-login → upserts a fake user, sets vibecoder_session, redirects to /agent
// Gated so it never works in production.
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
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
  const redirectTo = url.searchParams.get("next") ?? `${env.siteUrl}/agent`;

  const res = NextResponse.redirect(redirectTo);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: false, // dev only route, never production
  });
  return res;
}
