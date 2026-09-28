import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashToken } from "@/lib/auth";

export async function POST(req: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  // Relative redirect (not env.siteUrl) so sign-out lands on the same host
  // the user is on. Client also hard-reloads "/" after POST.
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}