import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { exchangeCode, fetchProfile, googleEnabled } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("oauth_state")?.value;

  const fail = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, env.siteUrl));

  if (!googleEnabled) return fail("not_configured");
  if (!code || !state || !expected || state !== expected) return fail("state");

  try {
    const { accessToken } = await exchangeCode(code);
    const profile = await fetchProfile(accessToken);
    if (!profile.emailVerified) return fail("email_not_verified");

    const user = await db.user.upsert({
      where: { googleSub: profile.sub },
      create: {
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name,
        image: profile.picture,
      },
      update: { email: profile.email, name: profile.name, image: profile.picture },
    });

    const token = await createSession(user.id);
    const res = NextResponse.redirect(new URL("/agent", env.siteUrl));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.NODE_ENV === "production",
    });
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("google callback failed:", err);
    return fail("callback");
  }
}