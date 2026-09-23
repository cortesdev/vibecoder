import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { setUserKey, deleteUserKey, listUserKeyProviders } from "@/lib/userkeys";
import { BYO_PROVIDERS } from "@/lib/models";
import { checkFreeReadiness, invalidateReadiness } from "@/lib/readiness";

// BYO provider keys. Only the provider list ever leaves the server — never
// the key material itself. The accepted providers come from the model
// registry (BYO_PROVIDERS) so the endpoint can never reject a provider the
// picker and the engine both support.
//
// Every response also carries `readiness`: whether each free model can
// actually answer right now, in the provider's own words. A key that is saved
// but rejected is the case that used to fail silently until the user typed a
// prompt, so saving and removing a key re-probes instead of trusting that the
// request succeeded.

export async function GET(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const [providers, readiness] = await Promise.all([
    listUserKeyProviders(user.id),
    checkFreeReadiness(user.id, { refresh }),
  ]);
  return NextResponse.json({ ok: true, providers, readiness });
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

  if (!(BYO_PROVIDERS as string[]).includes(provider)) {
    return NextResponse.json(
      { ok: false, error: `unknown provider (expected one of ${BYO_PROVIDERS.join(", ")})` },
      { status: 400 },
    );
  }

  await setUserKey(user.id, provider, key);
  invalidateReadiness(user.id);
  const [providers, readiness] = await Promise.all([
    listUserKeyProviders(user.id),
    checkFreeReadiness(user.id, { refresh: true }),
  ]);
  return NextResponse.json({ ok: true, providers, readiness });
}

export async function DELETE(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider") ?? "";
  if (!provider) return NextResponse.json({ ok: false, error: "provider required" }, { status: 400 });
  await deleteUserKey(user.id, provider);
  invalidateReadiness(user.id);
  const [providers, readiness] = await Promise.all([
    listUserKeyProviders(user.id),
    checkFreeReadiness(user.id, { refresh: true }),
  ]);
  return NextResponse.json({ ok: true, providers, readiness });
}
