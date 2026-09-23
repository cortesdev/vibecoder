import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureFreeWallet, getFreeWallet } from "@/lib/freewallet";

// Free-token wallet balance. ensureFreeWallet grants the sign-up allowance
// once (idempotent), so a fresh user immediately sees their free tokens.
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureFreeWallet(user.id);
  const wallet = await getFreeWallet(user.id);
  return NextResponse.json({ ok: true, ...wallet });
}