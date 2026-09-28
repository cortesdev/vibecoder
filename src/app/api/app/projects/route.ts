import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createProject } from "@/lib/projects";

export async function POST(req: Request) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string; templateId?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const project = await createProject(user.id, name, body?.templateId);
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "create failed" },
      { status: 400 },
    );
  }
}