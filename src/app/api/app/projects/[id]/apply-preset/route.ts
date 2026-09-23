import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { applyPreset } from "@/lib/projects";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const result = await applyPreset(user.id, id, slug);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result, { status: 200 });
}