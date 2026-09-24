import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runPrompt, type PromptAttachment } from "@/lib/projects";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    modelId?: string;
    useFreeTokens?: boolean;
    attachments?: unknown[];
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const modelId = typeof body?.modelId === "string" && body.modelId ? body.modelId : undefined;
  const useFreeTokens = body?.useFreeTokens !== false;

  const attachments: PromptAttachment[] = (Array.isArray(body?.attachments) ? body.attachments : [])
    .slice(0, 12)
    .flatMap((a) => {
      if (!a || typeof a !== "object") return [];
      const name = String((a as { name?: unknown }).name ?? "").slice(0, 200);
      if (!name) return [];
      const type = String((a as { type?: unknown }).type ?? "file").slice(0, 100);
      const size = Number((a as { size?: unknown }).size) || 0;
      const dataUrl = (a as { dataUrl?: unknown }).dataUrl;
      return [{ name, type, size, dataUrl: typeof dataUrl === "string" ? dataUrl.slice(0, 2_000_000) : undefined }];
    });

  const result = await runPrompt(user.id, id, prompt, modelId, useFreeTokens, attachments);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.cooldownMs ? 429 : 400;
    return NextResponse.json(result, { status, ...(result.cooldownMs ? { headers: { "retry-after": String(Math.ceil(result.cooldownMs / 1000)) } } : {}) });
  }
  return NextResponse.json(result, { status: 201 });
}
