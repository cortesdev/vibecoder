import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "vibecoder_session";
export const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and returns the raw cookie token (store the hash). */
export async function createSession(userId: string): Promise<string> {
  const token = randomUUID();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

async function sessionUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

/** Server-context helper: the signed-in User, or null. */
export async function currentUser() {
  return sessionUser();
}

/** Route-handler helper: 401 JSON when unauthenticated. */
export async function requireUser() {
  const user = await sessionUser();
  return { user, ok: Boolean(user) };
}

export function isAdmin(user: { email: string; role?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const configured = process.env.VIBECODER_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured && user.email.toLowerCase() === configured);
}

export async function requireAdmin() {
  const { user, ok } = await requireUser();
  return { user, ok: ok && isAdmin(user) };
}
