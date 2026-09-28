import { findOwnedProject, restoreProjectFiles, runPrompt, updatePromptMetadata } from "./projects";
import { freeModels, getModel, DEFAULT_MODEL_ID, type ModelDef } from "./models";
import { validateProject } from "./preview/validate";
import type { AgentAttachment, TokenUsage } from "./agent/types";

// Agent orchestrator (ADR: adr-orchestrator.md). One entry per turn with
// truthful outcomes. States: received → understanding → editing → validating
// → completed, or failed with an actionable reason. A run is completed only
// with persisted edits (or an explicit answer-only turn) plus a passing
// validation; a failed repair restores the last working revision and never
// reports "Done".

export type AgentKind = "auto" | "mock";

export interface TurnInput {
  userId: string;
  projectId: string;
  text: string;
  attachments?: AgentAttachment[];
  metadata?: string;
  modelId?: string;
  mode?: string;
  agent?: AgentKind;
}

export interface TurnValidation {
  ok: boolean;
  errors: { path?: string; message: string }[];
  repaired?: boolean;
}

export type TurnOutcome =
  | {
      status: "completed";
      reply?: string;
      modelId?: string;
      modelLabel?: string;
      providerLabel?: string;
      latencyMs?: number;
      usage?: TokenUsage;
      notice?: string;
      changedPaths: string[];
      validation: TurnValidation;
    }
  | { status: "failed"; error: string; notice?: string };

function hasImages(attachments: AgentAttachment[]): boolean {
  return attachments.some((a) => a.kind === "image" || a.kind === "videoFrames");
}

/** Screenshot requests must reach a vision-capable model. Returns the model
 *  to run plus an optional reroute notice. */
export interface TurnOptions {
  /** Test seam: pretend no vision-capable model is configured. */
  hasVisionFallback?: boolean;
}

export function resolveVisionModel(
  requestedId: string | undefined,
  needsVision: boolean,
  options: TurnOptions = {},
): { modelId: string | undefined; reroute?: string; unservable?: string } {
  if (!needsVision) return { modelId: requestedId };
  const requested: ModelDef | null = requestedId ? (getModel(requestedId) ?? null) : null;
  if (requested?.capabilities.vision) return { modelId: requestedId };
  const fallback = options.hasVisionFallback === false
    ? null
    : freeModels().find((m) => m.capabilities.vision);
  if (!fallback) {
    return {
      modelId: requestedId,
      unservable: "This turn includes images, but no vision-capable model is available. Add a key for one (Gemini, OpenRouter, or your own gateway) and retry — nothing was sent.",
    };
  }
  const from = requested ? `"${requested.label}" cannot see images, so ` : "";
  return {
    modelId: fallback.id,
    reroute: `${from}this ran on vision-capable ${fallback.label} instead.`,
  };
}

export async function runTurn(input: TurnInput, options: TurnOptions = {}): Promise<TurnOutcome> {
  const project = await findOwnedProject(input.userId, input.projectId);
  if (!project) return { status: "failed", error: "not_found" };
  const snapshot: Record<string, string> = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  const attachments = input.attachments ?? [];

  // understanding: capability gate before anything billable or persisted.
  const vision = resolveVisionModel(input.modelId ?? DEFAULT_MODEL_ID, hasImages(attachments), options);
  if (vision.unservable) return { status: "failed", error: vision.unservable };

  // editing: the project layer persists messages + applies valid edits.
  const result = await runPrompt(
    input.userId,
    input.projectId,
    input.text,
    vision.modelId,
    true,
    [],
    input.mode ?? "build",
    undefined,
    {},
    attachments,
    input.metadata,
    input.agent ?? "auto",
  );
  if (!result.ok) {
    return { status: "failed", error: result.error, notice: result.notice };
  }
  const notices = [vision.reroute, result.notice].filter(Boolean).join(" ");
  const changed = result.changedPaths ?? [];

  // Answer-only turns complete without a build to validate.
  if (changed.length === 0) {
    const validation: TurnValidation = { ok: true, errors: [] };
    if (result.assistantPromptId) {
      await updatePromptMetadata(input.userId, result.assistantPromptId, { validation });
    }
    return {
      status: "completed",
      reply: result.reply,
      modelId: result.modelId,
      modelLabel: result.modelLabel,
      providerLabel: result.providerLabel,
      latencyMs: result.latencyMs,
      usage: result.usage,
      notice: notices || undefined,
      changedPaths: [],
      validation,
    };
  }

  // validating: bundle the edited tree. One bounded repair on failure.
  const reread = await findOwnedProject(input.userId, input.projectId);
  const edited: Record<string, string> = Object.fromEntries(
    (reread?.files ?? []).map((f) => [f.path, f.content]),
  );
  let validation = await validateProject(edited);
  let repaired = false;
  if (!validation.ok) {
    const diagnostics = validation.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join("\n");
    const retry = await runPrompt(
      input.userId,
      input.projectId,
      `The previous change broke the build. Fix ONLY the errors below; do not redesign anything:\n${diagnostics}`,
      vision.modelId,
      true,
      [],
      input.mode ?? "build",
      undefined,
      { answer: `Build diagnostics:\n${diagnostics}` },
      [],
      input.metadata,
      input.agent ?? "auto",
    );
    if (retry.ok) {
      const reread2 = await findOwnedProject(input.userId, input.projectId);
      validation = await validateProject(
        Object.fromEntries((reread2?.files ?? []).map((f) => [f.path, f.content])),
      );
      repaired = validation.ok;
    }
  }

  if (!validation.ok) {
    // Last working revision wins: restore the snapshot, report honestly.
    await restoreProjectFiles(input.userId, input.projectId, snapshot);
    const summary = validation.errors.map((e) => e.message).slice(0, 3).join(" ");
    return {
      status: "failed",
      error: `The change broke the build and the repair attempt failed (${summary}). Your previous working files were restored — nothing half-applied.`,
      notice: notices || undefined,
    };
  }

  const finalValidation: TurnValidation = {
    ok: true,
    errors: [],
    ...(repaired ? { repaired: true as const } : {}),
  };
  if (result.assistantPromptId) {
    await updatePromptMetadata(input.userId, result.assistantPromptId, { validation: finalValidation });
  }
  const finalNotice = [repaired ? "The first attempt broke the build; the repair fixed it." : "", notices]
    .filter(Boolean)
    .join(" ");
  return {
    status: "completed",
    reply: result.reply,
    modelId: result.modelId,
    modelLabel: result.modelLabel,
    providerLabel: result.providerLabel,
    latencyMs: result.latencyMs,
    usage: result.usage,
    notice: finalNotice || undefined,
    changedPaths: changed,
    validation: finalValidation,
  };
}
