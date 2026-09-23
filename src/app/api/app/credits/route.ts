import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBalance, ensureWallet, CREDIT_PACKS } from "@/lib/credits";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureWallet(user.id);
  const balance = await getBalance(user.id);
  return NextResponse.json({ ok: true, balance, packs: CREDIT_PACKS });
}
