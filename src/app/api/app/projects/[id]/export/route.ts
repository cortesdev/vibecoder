import { requireUser } from "@/lib/auth";
import { findOwnedProject } from "@/lib/projects";
import { buildExportZip, exportFilename, ExportError } from "@/lib/projects/export";

// Authenticated ZIP download of the stored project files. Ownership is
// verified before anything is read; failures are structured JSON, never a
// half-written archive.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await findOwnedProject(user.id, id);
  if (!project) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let zip: Uint8Array;
  try {
    zip = buildExportZip(Object.fromEntries(project.files.map((f) => [f.path, f.content])));
  } catch (err) {
    const message = err instanceof ExportError ? err.message : "export failed";
    const path = err instanceof ExportError ? err.path : undefined;
    return Response.json({ ok: false, error: message, ...(path ? { path } : {}) }, { status: 422 });
  }

  const filename = exportFilename(project.name);
  return new Response(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(zip.length),
      "cache-control": "no-store",
    },
  });
}
