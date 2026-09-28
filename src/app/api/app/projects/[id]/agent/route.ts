import { requireUser } from "@/lib/auth";
import { findOwnedProject, runPrompt } from "@/lib/projects";
import {
  checkRequestBounds,
  validateAttachmentBytes,
} from "@/lib/attachments/server";
import { extractVideoFrames, unsupportedRunner } from "@/lib/attachments/video";
import { measure } from "@/lib/instrument";
import type { AgentAttachment } from "@/lib/agent/types";

// Multimodal agent turn. Accepts multipart/form-data with `message` and
// `attachments`; rejected content never reaches the model. Typed JSON either
// way (the streaming format was retired with the old chat).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await findOwnedProject(user.id, id);
  if (!project) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }
  const rawMessage = form.get("message");
  const message = typeof rawMessage === "string" ? rawMessage.trim().slice(0, 4000) : "";
  const rawModel = form.get("modelId");
  const modelId = typeof rawModel === "string" && rawModel ? rawModel : undefined;
  const uploads = form.getAll("attachments").filter((v): v is File => v instanceof File);
  if (!message && uploads.length === 0) {
    return Response.json({ ok: false, error: "Prompt is empty." }, { status: 400 });
  }

  const bounds = checkRequestBounds(uploads.map((f) => ({ name: f.name, size: f.size })));
  if (bounds) {
    return Response.json(
      { ok: false, error: bounds.message, code: bounds.code, fileName: bounds.fileName },
      { status: bounds.code },
    );
  }

  const attachments: AgentAttachment[] = [];
  for (const upload of uploads) {
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const checked = validateAttachmentBytes({ name: upload.name, mimeType: upload.type, bytes });
    if (!checked.ok) {
      return Response.json(
        {
          ok: false,
          error: checked.message,
          code: checked.code,
          fileName: checked.fileName,
          ...(checked.limitBytes === undefined ? {} : { limitBytes: checked.limitBytes }),
        },
        { status: checked.code },
      );
    }
    if (checked.attachment.kind === "videoFrames") {
      const frames = await extractVideoFrames(
        { name: upload.name, mimeType: checked.detected, bytes },
        unsupportedRunner,
      );
      if (!frames.ok) {
        return Response.json(
          { ok: false, error: frames.message, code: frames.code, fileName: frames.fileName },
          { status: frames.code },
        );
      }
      attachments.push({
        kind: "videoFrames",
        name: upload.name,
        mimeType: checked.detected,
        frames: frames.frames,
      });
    } else {
      attachments.push(checked.attachment);
    }
  }

  const described = attachments.map((a) =>
    a.kind === "image"
      ? { kind: a.kind, name: a.name, mimeType: a.mimeType }
      : a.kind === "videoFrames"
        ? { kind: a.kind, name: a.name, mimeType: a.mimeType, frames: a.frames.length }
        : { kind: a.kind, name: a.name, mimeType: a.mimeType, truncated: a.truncated },
  );
  const exportUrl = `/api/app/projects/${id}/export`;
  const metadata = JSON.stringify({ attachments: described, exportUrl });

  const result = await measure("agent.turn", () =>
    runPrompt(user.id, id, message || "(attachments only)", modelId, true, [], "build", undefined, {}, attachments, metadata),
  );
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error, notice: result.notice }, { status: 400 });
  }
  return Response.json({
    ok: true,
    reply: result.reply,
    modelId: result.modelId,
    modelLabel: result.modelLabel,
    providerLabel: result.providerLabel,
    latencyMs: result.latencyMs,
    usage: result.usage,
    notice: result.notice,
    changedPaths: result.changedPaths,
    success: result.success,
    exportUrl,
    attachments: described,
  });
}
