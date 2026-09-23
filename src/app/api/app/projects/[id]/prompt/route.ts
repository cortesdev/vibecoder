import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runPrompt } from "@/lib/projects";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";

  const result = await runPrompt(user.id, id, prompt);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result, { status: 201 });
}