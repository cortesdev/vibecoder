import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { revertChange } from "@/lib/projects";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ changeId: string }> },
) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { changeId } = await params;
  const result = await revertChange(user.id, changeId);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result);
}