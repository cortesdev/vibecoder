import { db } from "./db";

// Free-token wallet: a finite sign-up allowance that pays for hosted
// (credits-tier) model runs before credits do. 1 credit ≈ 10,000 free tokens
// (so a 1-credit Haiku prompt ≈ 10k tokens, an 8-credit Sonnet one ≈ 80k).
// The grant is idempotent via the (grant, signup:<userId>) ledger ref, so it
// can never be double-applied however many times ensureFreeWallet runs.

export const FREE_TOKENS_PER_CREDIT = 10_000;
export const SIGNUP_FREE_TOKENS = 50_000;

export async function ensureFreeWallet(userId: string) {
  const existing = await db.freeWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    const wallet = await db.freeWallet.create({
      data: { userId, granted: SIGNUP_FREE_TOKENS, balance: SIGNUP_FREE_TOKENS },
    });
    await db.freeTxn.create({
      data: {
        userId,
        delta: SIGNUP_FREE_TOKENS,
        reason: "grant",
        ref: `signup:${userId}`,
        note: "Sign-up free-token allowance",
      },
    });
    return wallet;
  } catch {
    // Raced with another request creating the wallet.
    return db.freeWallet.findUniqueOrThrow({ where: { userId } });
  }
}

export async function getFreeBalance(userId: string): Promise<number> {
  const wallet = await db.freeWallet.findUnique({ where: { userId } });
  return wallet?.balance ?? 0;
}

export async function getFreeWallet(userId: string) {
  return ensureFreeWallet(userId).then((w) => ({ granted: w.granted, balance: w.balance }));
}

/**
 * Atomically spend free tokens for one run. Returns the new balance, or null
 * when the wallet is empty (the caller falls back to credits).
 */
export async function spendFreeTokens(
  userId: string,
  tokens: number,
  ref: string,
  note: string,
): Promise<number | null> {
  if (tokens <= 0) return getFreeBalance(userId);
  try {
    const wallet = await db.$transaction(async (tx) => {
      const current = await tx.freeWallet.findUnique({ where: { userId } });
      if (!current || current.balance < tokens) throw new Error("INSUFFICIENT");
      await tx.freeTxn.create({
        data: { userId, delta: -tokens, reason: "consume", ref, note },
      });
      return tx.freeWallet.update({
        where: { userId },
        data: { balance: { decrement: tokens } },
      });
    });
    return wallet.balance;
  } catch {
    return null;
  }
}