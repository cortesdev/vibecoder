import { requireUser } from "@/lib/auth";
import { createProjectFile, deleteProjectFile, findOwnedProject, renameProjectFile } from "@/lib/projects";

// Project file collection: create, rename, delete. Ownership is verified by
// the service layer; paths are validated there too.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { path?: unknown; content?: unknown } | null;
  if (typeof body?.path !== "string") return Response.json({ ok: false, error: "path is required." }, { status: 400 });
  const content = typeof body.content === "string" ? body.content.slice(0, 500_000) : "";
  const result = await createProjectFile(user.id, id, body.path, content);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "exists" ? 409 : 400;
    return Response.json({ ok: false, error: result.error }, { status });
  }
  return Response.json({ ok: true, path: result.path }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown } | null;
  if (typeof body?.from !== "string" || typeof body?.to !== "string") {
    return Response.json({ ok: false, error: "from and to are required." }, { status: 400 });
  }
  const result = await renameProjectFile(user.id, id, body.from, body.to);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "exists" ? 409 : 400;
    return Response.json({ ok: false, error: result.error }, { status });
  }
  return Response.json({ ok: true, path: result.path });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  if (typeof body?.path !== "string") return Response.json({ ok: false, error: "path is required." }, { status: 400 });
  const result = await deleteProjectFile(user.id, id, body.path);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  }
  // The project page needs the project even to show an empty file list.
  const project = await findOwnedProject(user.id, id);
  return Response.json({ ok: true, path: result.path, empty: (project?.files.length ?? 1) === 0 });
}
