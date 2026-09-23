import { db } from "./db";

// Credit wallet: append-only ledger + derived balance. (reason, ref) is
// unique, so Stripe retries and double-spends can never double-apply.
// 1 credit = $0.10 of user money; paid model runs cost 2× raw provider cost
// (the 50% platform margin lives in the model registry prices).

export const CREDIT_PACKS = [
  { credits: 50, priceUsd: 5, label: "Starter" },
  { credits: 200, priceUsd: 20, label: "Builder" },
  { credits: 600, priceUsd: 60, label: "Studio" },
] as const;

export async function getBalance(userId: string): Promise<number> {
  const wallet = await db.creditWallet.findUnique({ where: { userId } });
  return wallet?.balance ?? 0;
}

export async function ensureWallet(userId: string) {
  const existing = await db.creditWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await db.creditWallet.create({ data: { userId } });
  } catch {
    // Raced with another request creating the wallet.
    return db.creditWallet.findUniqueOrThrow({ where: { userId } });
  }
}

/** Idempotent purchase credit (used by the Stripe webhook on retries). */
export async function purchaseCredits(input: {
  userId: string;
  credits: number;
  stripeSessionId: string;
  testMode?: boolean;
}): Promise<{ applied: boolean }> {
  try {
    await db.$transaction(async (tx) => {
      await tx.creditTxn.create({
        data: {
          userId: input.userId,
          delta: input.credits,
          reason: "purchase",
          ref: input.stripeSessionId,
          note: input.testMode ? "test purchase" : "stripe purchase",
        },
      });
      await tx.creditWallet.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, balance: input.credits },
        update: { balance: { increment: input.credits } },
      });
    });
    return { applied: true };
  } catch {
    // Unique (reason, ref) hit → this purchase already applied. Idempotent no-op.
    return { applied: false };
  }
}

/**
 * Atomically debit credits for one paid model run. Returns false when the
 * balance is insufficient (the caller falls back to the free tier).
 */
export async function debitForRun(input: {
  userId: string;
  cost: number;
  ref: string;
  note: string;
}): Promise<boolean> {
  if (input.cost <= 0) return true;
  try {
    await db.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({ where: { userId: input.userId } });
      if (!wallet || wallet.balance < input.cost) {
        throw new Error("INSUFFICIENT");
      }
      await tx.creditTxn.create({
        data: {
          userId: input.userId,
          delta: -input.cost,
          reason: "model_run",
          ref: input.ref,
          note: input.note,
        },
      });
      await tx.creditWallet.update({
        where: { userId: input.userId },
        data: { balance: { decrement: input.cost } },
      });
    });
    return true;
  } catch {
    return false;
  }
}

/** Refund a failed paid run (idempotent per ref via the ledger). */
export async function refundRun(input: {
  userId: string;
  cost: number;
  ref: string;
}): Promise<void> {
  if (input.cost <= 0) return;
  await purchaseCredits({
    userId: input.userId,
    credits: input.cost,
    stripeSessionId: `refund:${input.ref}`,
  });
}
