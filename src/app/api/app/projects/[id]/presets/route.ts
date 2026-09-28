import { requireUser } from "@/lib/auth";
import { applyProjectPreset, undoProjectPreset } from "@/lib/projects";
import { measure } from "@/lib/instrument";

// Theme actions. Apply rewrites only the theme section; undo restores exact
// bytes or refuses with an explanation when newer work would be overwritten.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; slug?: unknown } | null;

  if (body?.action === "undo") {
    const result = await measure("preset.undo", () => undoProjectPreset(user.id, id));
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return Response.json({ ok: false, error: result.error }, { status });
    }
    return Response.json({ ok: true, presetId: result.presetId });
  }

  if (body?.action === "apply" && typeof body.slug === "string") {
    const result = await measure("preset.apply", () => applyProjectPreset(user.id, id, body.slug as string));
    if (!result.ok) {
      const status =
        result.error === "not_found" ? 404 : result.error === "unknown_preset" ? 400 : 422;
      return Response.json({ ok: false, error: result.error }, { status });
    }
    return Response.json({ ok: true, slug: result.slug, name: result.name });
  }

  return Response.json({ ok: false, error: "Expected {action: 'apply'|'undo', slug?}." }, { status: 400 });
}
