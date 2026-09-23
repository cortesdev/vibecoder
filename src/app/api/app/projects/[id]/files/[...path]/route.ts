import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveFile } from "@/lib/projects";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id, path } = await params;
  const relPath = path.join("/");
  const body = (await req.json().catch(() => null)) as { content?: string } | null;
  const content = typeof body?.content === "string" ? body.content : "";

  const result = await saveFile(user.id, id, relPath, content);
  const status = result.ok ? 200 : result.error === "not_found" ? 404 : 400;
  return NextResponse.json(result, { status });
}