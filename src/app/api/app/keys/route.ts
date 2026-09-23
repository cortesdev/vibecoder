import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setUserKey, deleteUserKey, listUserKeyProviders } from "@/lib/userkeys";

// BYO provider keys. Only the provider list ever leaves the server — never
// the key material itself.

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const providers = await listUserKeyProviders(user.id);
  return NextResponse.json({ ok: true, providers });
}

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    provider?: string;
    key?: string;
  } | null;
  const provider = body?.provider ?? "";
  const key = typeof body?.key === "string" ? body.key : "";

  if (!["opencode", "zai", "anthropic", "openai"].includes(provider)) {
    return NextResponse.json({ ok: false, error: "unknown provider" }, { status: 400 });
  }

  await setUserKey(user.id, provider, key);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") ?? "";
  if (!provider) return NextResponse.json({ ok: false }, { status: 400 });
  await deleteUserKey(user.id, provider);
  return NextResponse.json({ ok: true });
}
