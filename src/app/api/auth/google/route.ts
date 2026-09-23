import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeUrl, googleEnabled } from "@/lib/google";
import { env } from "@/lib/env";

export async function GET() {
  if (!googleEnabled) {
    return NextResponse.redirect(new URL("/login?error=not_configured", env.siteUrl));
  }
  const state = randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}