import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { INTEGRATIONS } from "@/lib/integrations";
import { addServiceKey, listServiceKeys, removeServiceKey } from "@/lib/projects";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const counts = await listServiceKeys(user.id);
  return NextResponse.json({ ok: true, services: INTEGRATIONS, counts });
}

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    key?: string;
    label?: string;
  } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const key = typeof body?.key === "string" ? body.key : "";
  const label = typeof body?.label === "string" ? body.label : "";
  if (!INTEGRATIONS.some((s) => s.slug === slug)) {
    return NextResponse.json({ ok: false, error: "unknown_service" }, { status: 400 });
  }
  const result = await addServiceKey(user.id, slug, key, label);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  const result = await removeServiceKey(user.id, slug);
  return NextResponse.json(result, { status: 200 });
}