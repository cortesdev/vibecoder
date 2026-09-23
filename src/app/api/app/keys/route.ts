import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setUserKey, deleteUserKey, listUserKeyProviders } from "@/lib/userkeys";
import { PROVIDER_META } from "@/lib/models";

// BYO provider keys. Only the provider list ever leaves the server — never
// the key material itself.
//
// The allow-list is derived from the model registry instead of hand-written:
// a hand-written list silently drifted (it rejected "google" while the registry
// shipped a free Gemini model whose key the engine reads from the same table),
// so every provider the registry knows is accepted here automatically.
const KEY_PROVIDERS: string[] = Object.keys(PROVIDER_META).filter((p) => p !== "vibecoder");

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

  if (!KEY_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: `unknown provider (expected one of ${KEY_PROVIDERS.join(", ")})` },
      { status: 400 },
    );
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
