import { db } from "./db";

// User-supplied provider keys (BYO). Stored server-side, never returned to
// the client after save — the API only exposes which providers are set.

export async function setUserKey(userId: string, provider: string, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return deleteUserKey(userId, provider);
  await db.userKey.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, key: trimmed },
    update: { key: trimmed },
  });
}

export async function deleteUserKey(userId: string, provider: string): Promise<void> {
  await db.userKey.deleteMany({ where: { userId, provider } });
}

export async function listUserKeyProviders(userId: string): Promise<string[]> {
  const rows = await db.userKey.findMany({ where: { userId }, select: { provider: true } });
  return rows.map((r) => r.provider);
}
