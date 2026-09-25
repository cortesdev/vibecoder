import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listLearning, setLearningStatus, type LearningStatus } from "@/lib/learning";

export const dynamic = "force-dynamic";

function isStatus(value: unknown): value is LearningStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export async function GET(request: Request) {
  const { user, ok } = await requireAdmin();
  if (!ok || !user) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status");
  if (status && !isStatus(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const entries = await listLearning({ status: status as LearningStatus | undefined });
  return NextResponse.json({ ok: true, entries });
}

export async function PATCH(request: Request) {
  const { user, ok } = await requireAdmin();
  if (!ok || !user) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const input = body as { id?: unknown; status?: unknown };
  if (typeof input.id !== "string" || !input.id || !isStatus(input.status)) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const updated = await setLearningStatus(input.id, input.status);
  if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
