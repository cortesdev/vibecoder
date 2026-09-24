import { db } from "./db";

// Per-user cooldown for the always-free models. The point is economic: a free
// answer is served from a shared, finite quota (the platform's one key, or the
// user's own), so a single user must not be able to drain it in a burst. After
// a free run, the next one is blocked until nextAllowedAt.
//
// DB-backed on purpose — the site runs on serverless instances, where an
// in-memory Map would be per-instance and meaningless. Rows exist only while a
// cooldown is live, so the table stays bounded by concurrent cooldowns.

/** Default wait between free answers. Env-overridable for testing / ops. */
export const FREE_COOLDOWN_MS = (() => {
  const raw = Number(process.env.VIBECODER_FREE_COOLDOWN_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 15 * 60 * 1000;
})();

/** Milliseconds still left on this user's free-model cooldown, 0 when none. */
export async function freeCooldownMs(userId: string): Promise<number> {
  const row = await db.freeCooldown.findUnique({ where: { userId } });
  if (!row) return 0;
  const left = row.nextAllowedAt.getTime() - Date.now();
  if (left <= 0) return 0;
  return left;
}

/** Start (or extend) the user's cooldown after a completed free run. */
export async function startFreeCooldown(userId: string): Promise<void> {
  await db.freeCooldown.upsert({
    where: { userId },
    create: { userId, nextAllowedAt: new Date(Date.now() + FREE_COOLDOWN_MS) },
    update: { nextAllowedAt: new Date(Date.now() + FREE_COOLDOWN_MS) },
  });
}