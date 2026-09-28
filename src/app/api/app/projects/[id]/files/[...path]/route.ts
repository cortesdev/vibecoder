import { requireUser } from "@/lib/auth";
import { findOwnedProject, saveProjectFile } from "@/lib/projects";

// Single file: read, and conflict-checked save. A save carrying
// `expectedContent` that no longer matches storage is refused with 409 and
// the current bytes — never silently clobbered.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id, path } = await params;
  const project = await findOwnedProject(user.id, id);
  if (!project) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const rel = path.join("/");
  const file = project.files.find((f) => f.path === rel);
  if (!file) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, path: file.path, content: file.content });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id, path } = await params;
  const body = (await req.json().catch(() => null)) as { content?: unknown; expectedContent?: unknown } | null;
  if (typeof body?.content !== "string") {
    return Response.json({ ok: false, error: "content is required." }, { status: 400 });
  }
  if (body.content.length > 500_000) {
    return Response.json({ ok: false, error: "File too large." }, { status: 413 });
  }
  const result = await saveProjectFile(
    user.id,
    id,
    path.join("/"),
    body.content,
    typeof body.expectedContent === "string" ? body.expectedContent : undefined,
  );
  if (!result.ok) {
    if (result.error === "not_found") return Response.json({ ok: false, error: result.error }, { status: 404 });
    if (result.error === "conflict") {
      return Response.json({ ok: false, error: "conflict", current: result.current }, { status: 409 });
    }
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, path: result.path });
}
