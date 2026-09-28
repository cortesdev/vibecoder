import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { findOwnedProject } from "@/lib/projects";
import { SHARE_SNAPSHOT_MAX_BYTES, SHARE_TTL_MS, hashToken, mintToken } from "@/lib/preview/share";

// Create a read-only snapshot share, or revoke all of a project's shares.
// The token is returned once and never stored; only its hash persists.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await findOwnedProject(user.id, id);
  if (!project) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { snapshot?: unknown } | null;
  if (typeof body?.snapshot !== "string" || body.snapshot.length === 0) {
    return Response.json({ ok: false, error: "A built snapshot is required." }, { status: 400 });
  }
  if (body.snapshot.length > SHARE_SNAPSHOT_MAX_BYTES) {
    return Response.json({ ok: false, error: "Snapshot too large." }, { status: 413 });
  }

  const token = mintToken();
  await db.previewShare.create({
    data: {
      projectId: id,
      tokenHash: hashToken(token),
      snapshot: body.snapshot,
      expiresAt: new Date(Date.now() + SHARE_TTL_MS),
    },
  });
  return Response.json({ ok: true, token, url: `/p/${token}` }, { status: 201 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await findOwnedProject(user.id, id);
  if (!project) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  await db.previewShare.updateMany({
    where: { projectId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return Response.json({ ok: true });
}
