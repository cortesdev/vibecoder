import { requireUser } from "@/lib/auth";
import { planPrompt, runPrompt, type PromptAttachment, type PromptExecutionContext } from "@/lib/projects";

export const maxDuration = 120;

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user } = await requireUser();
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    modelId?: string;
    attachments?: unknown[];
    mode?: string;
    phase?: string;
    plan?: string;
    answer?: string;
    skillIds?: unknown[];
  } | null;

  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const mode = ["build", "plan", "mission", "skills"].includes(body?.mode ?? "")
    ? (body?.mode as string)
    : "build";
  const modelId = typeof body?.modelId === "string" && body.modelId ? body.modelId : undefined;
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
  const phase = body?.phase === "plan" ? "plan" : "execute";
  const plan = typeof body?.plan === "string" ? body.plan.trim().slice(0, 12_000) : "";
  const answer = typeof body?.answer === "string" ? body.answer.trim().slice(0, 4_000) : "";
  const skillIds = (Array.isArray(body?.skillIds) ? body.skillIds : [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.slice(0, 64))
    .slice(0, 3);
  const executionContext: PromptExecutionContext = { approvedPlan: plan || undefined, answer: answer || undefined, skillIds };

  if (!prompt.trim()) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse({ type: "error", error: "Prompt is empty." })));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));

      send({ type: "status", message: "Resolving model and keys…" });
      // slight delay so the first event paints before the LLM call
      await new Promise((r) => setTimeout(r, 120));
      send({ type: "status", message: "Contacting model — generating files…" });

      let dot = 0;
      heartbeat = setInterval(() => {
        dot += 1;
        send({ type: "heartbeat", message: `Still generating${".".repeat((dot % 3) + 1)} (${dot * 2}s)` });
      }, 2000);

      try {
        const onStatus = (message: string) => {
          try {
            send({ type: "status", message });
          } catch {
            return;
          }
        };
        if (phase === "plan") {
          const result = await planPrompt(
            user.id,
            id,
            prompt,
            modelId,
            true,
            attachments,
            mode,
            onStatus,
            skillIds,
          );
          if (heartbeat) clearInterval(heartbeat);
          if (!result.ok) {
            send({ type: "error", error: result.error, notice: result.notice, cooldownMs: result.cooldownMs });
          } else {
            send({
              type: "plan_done",
              ok: true,
              plan: result.plan,
              reply: result.reply,
              suggestions: result.suggestions,
              skillIds: result.skillIds,
              modelId: result.modelId,
              modelLabel: result.modelLabel,
              usage: result.usage,
              usedFallback: result.usedFallback,
              creditsSpent: result.creditsSpent,
              notice: result.notice,
            });
          }
        } else {
          const result = await runPrompt(
            user.id,
            id,
            prompt,
            modelId,
            true,
            attachments,
            mode,
            onStatus,
            executionContext,
          );
          if (heartbeat) clearInterval(heartbeat);
          if (!result.ok) {
            send({ type: "error", error: result.error ?? "agent failed", notice: result.notice, cooldownMs: result.cooldownMs });
          } else {
            send({
              type: "done",
              ok: true,
              prompt: result.prompt,
              reply: result.reply,
              modelId: result.modelId,
              modelLabel: result.modelLabel,
              usage: result.usage,
              usedFallback: result.usedFallback,
              creditsSpent: result.creditsSpent,
              notice: result.notice,
            });
          }
        }
      } catch (err) {
        if (heartbeat) clearInterval(heartbeat);
        send({ type: "error", error: err instanceof Error ? err.message : "agent failed" });
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
