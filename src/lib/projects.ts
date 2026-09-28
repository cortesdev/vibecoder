import { db } from "./db";
import { runModelPrompt } from "./engine";
import { isValidProjectPath, sanitizePath } from "./agent/paths";
import { getSkillCatalog } from "./agent/skill-catalog";
import { selectSkillIds, toSkillSummary, type SkillDefinition } from "./agent/skills";
import { getApprovedLearningContext, recordLearning } from "./learning";
import type { AgentAttachment, AgentPlanOptions, AgentRunContext } from "./agent/types";
import { presetCss, PRESETS } from "./presets";

import { filesFor } from "./templates/catalog";

// New projects start from the template catalog (src/lib/templates/): six
// runnable Vite + React + TypeScript starters. The catalog replaced the old
// single scaffoldFor() starter; the landing template is its successor.

/** Every query is scoped by userId; returns null when the caller doesn't own it. */
export async function findOwnedProject(userId: string, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { files: { orderBy: { path: "asc" } }, changes: { orderBy: { createdAt: "asc" } } },
  });
  if (!project || project.userId !== userId) return null;
  return project;
}

/** Create a project from a catalog template (unknown ids → landing). */
export async function createProject(userId: string, name: string, templateId?: unknown) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required.");
  return db.project.create({
    data: {
      userId,
      name: trimmed,
      files: {
        create: Object.entries(filesFor(templateId, trimmed)).map(([path, content]) => ({ path, content })),
      },
    },
  });
}

export interface PromptAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface PromptExecutionContext {
  approvedPlan?: string;
  answer?: string;
  skillIds?: string[];
}

interface SkillContext {
  catalog: Awaited<ReturnType<typeof getSkillCatalog>>;
  ids: string[];
  skills: SkillDefinition[];
}

const MODE_PREFIX: Record<string, string> = {
  plan:
    "You are in PLAN mode. Do not rewrite the app. Produce a short written plan by creating or editing PLAN.md at the project root, with numbered steps and the files each step will touch.",
  mission:
    "You are in MISSION mode. Take the boldest correct pass at the request: make the whole thing feel finished, coherent and impressive, while keeping every edit valid for the project.",
  skills:
    "You are in SKILLS mode. Prefer small, surgical, well-crafted edits that demonstrate good engineering practice (clean structure, accessible markup, tidy CSS).",
};

function attachmentNote(attachments: PromptAttachment[]): string {
  if (attachments.length === 0) return "";
  return `\n\nAttachments:\n${attachments
    .map((a) => {
      const kind = a.type.startsWith("image/") ? "image" : a.type.startsWith("video/") ? "video" : "file";
      const img = a.dataUrl && kind === "image" ? " (image data embedded)" : "";
      return `- ${a.name} (${kind}, ${a.size} bytes)${img}`;
    })
    .join("\n")}`;
}

function promptForMode(content: string, attachments: PromptAttachment[], mode: string): string {
  const agentText = `${content}${attachmentNote(attachments)}`;
  return MODE_PREFIX[mode] ? `${MODE_PREFIX[mode]}\n\n${agentText}` : agentText;
}

async function loadSkillContext(prompt: string, requested: unknown): Promise<SkillContext> {
  const catalog = await getSkillCatalog();
  const ids = selectSkillIds(catalog.skills, requested, prompt);
  const byId = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  return {
    catalog,
    ids,
    skills: ids.map((id) => byId.get(id)).filter((skill): skill is SkillDefinition => Boolean(skill)),
  };
}

async function recordExecutionLearning(input: {
  userId: string;
  projectId: string;
  mode: string;
  approvedPlan?: string;
  skillIds?: string[];
  appliedPaths: string[];
}): Promise<void> {
  if (!input.approvedPlan) return;
  try {
    await recordLearning({
      userId: input.userId,
      projectId: input.projectId,
      kind: "execution-outcome",
      summary: `Approved plan: ${input.approvedPlan}\nApplied paths: ${input.appliedPaths.join(", ") || "none"}`,
      skillIds: input.skillIds,
      mode: input.mode,
      success: true,
    });
  } catch {
    return;
  }
}

export async function planPrompt(
  userId: string,
  projectId: string,
  content: string,
  modelId?: string,
  useFreeTokens = true,
  attachments: PromptAttachment[] = [],
  mode = "build",
  onEvent?: (message: string) => void,
  requestedSkillIds: unknown = [],
): Promise<
  | {
      ok: true;
      plan: string;
      reply?: string;
      suggestions: string[];
      skillIds: string[];
      modelId?: string;
      modelLabel?: string;
      providerLabel?: string;
      latencyMs?: number;
      usage?: import("./agent/types").TokenUsage;
      usedFallback?: boolean;
      creditsSpent?: number;
      notice?: string;
    }
  | { ok: false; error: string; notice?: string; cooldownMs?: number }
> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, error: "not_found" };
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Prompt is empty." };
  const files = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  onEvent?.(`Reading ${project.files.length} project file${project.files.length === 1 ? "" : "s"}…`);
  const skillContext = await loadSkillContext(trimmed, requestedSkillIds);
  const learningContext = await getApprovedLearningContext();
  onEvent?.(`Selecting ${skillContext.ids.length} skill${skillContext.ids.length === 1 ? "" : "s"}…`);
  const options: AgentPlanOptions = {
    skills: skillContext.catalog.skills.map(toSkillSummary),
    pinnedSkillIds: Array.isArray(requestedSkillIds) && requestedSkillIds.length > 0 ? skillContext.ids : undefined,
  };
  const planningPrompt = `${learningContext}${learningContext ? "\n\n" : ""}${promptForMode(trimmed, attachments, mode === "plan" ? "build" : mode)}`;
  const outcome = await runModelPrompt({
    userId,
    projectId,
    modelId,
    prompt: trimmed,
    files,
    useFreeTokens,
    run: async (agent) => agent.plan(planningPrompt, files, options),
  });
  if (!outcome.ok || !outcome.plan) {
    return {
      ok: false,
      error: outcome.error ?? "The planner did not return a plan.",
      notice: outcome.notice,
      cooldownMs: outcome.cooldownMs,
    };
  }
  const selected = selectSkillIds(skillContext.catalog.skills, outcome.skillIds ?? [], trimmed);
  return {
    ok: true,
    plan: outcome.plan,
    reply: outcome.reply,
    suggestions: outcome.suggestions ?? [],
    skillIds: selected,
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    providerLabel: outcome.providerLabel,
    latencyMs: outcome.latencyMs,
    usage: outcome.usage,
    usedFallback: outcome.usedFallback,
    creditsSpent: outcome.creditsSpent,
    notice: outcome.notice,
  };
}

export async function runPrompt(
  userId: string,
  projectId: string,
  content: string,
  modelId?: string,
  useFreeTokens = true,
  attachments: PromptAttachment[] = [],
  mode = "build",
  onEvent?: (message: string) => void,
  executionContext: PromptExecutionContext = {},
  agentAttachments: AgentAttachment[] = [],
  metadata?: string,
) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false as const, error: "Prompt is empty." };

  const files = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  onEvent?.(`Reading ${project.files.length} project file${project.files.length === 1 ? "" : "s"}…`);

  const hasExecutionContext = Boolean(
    executionContext.approvedPlan || executionContext.answer || executionContext.skillIds?.length,
  );
  const learningContext = hasExecutionContext ? await getApprovedLearningContext() : "";
  const promptForAgent = `${learningContext}${learningContext ? "\n\n" : ""}${promptForMode(trimmed, attachments, mode)}`;
  const skillContext = hasExecutionContext ? await loadSkillContext(trimmed, executionContext.skillIds ?? []) : undefined;
  const agentContext: AgentRunContext = {
    approvedPlan: executionContext.approvedPlan,
    answer: executionContext.answer,
    skills: skillContext?.skills,
    attachments: agentAttachments,
  };

  const outcome = await runModelPrompt({
    userId,
    projectId,
    modelId,
    prompt: trimmed,
    files,
    useFreeTokens,
    run: async (agent) => {
      let result;
      try {
        result = await agent.run(promptForAgent, files, agentContext);
      } catch (err) {
        throw err instanceof Error ? err : new Error("agent failed");
      }
      for (const edit of result.edits) {
        onEvent?.(`Editing ${edit.path}…`);
      }
      return result;
    },
  });

  if (!outcome.ok || !outcome.edits) {
    // Persist the failed turn so the chat thread shows the whole history.
    await db.prompt.create({
      data: { projectId, content: trimmed, role: "user", mode },
    });
    await db.prompt.create({
      data: {
        projectId,
        content: outcome.notice ? `${outcome.error ?? "Agent failed"} ${outcome.notice}` : outcome.error ?? "Agent failed",
        role: "assistant",
        mode,
        modelId: outcome.modelId ?? "",
        modelLabel: outcome.modelLabel ?? "",
        error: outcome.error ?? "agent failed",
      },
    });
    return {
      ok: false as const,
      error: outcome.error ?? "agent failed",
      notice: outcome.notice,
      cooldownMs: outcome.cooldownMs,
    };
  }
  const edits = outcome.edits;

  const valid = edits.filter((e) => {
    if (!isValidProjectPath(e.path)) return false;
    const current = files[e.path] ?? "";
    return e.before === current && e.after !== current;
  });

  if (valid.length === 0 && outcome.reply?.trim()) {
    // Pure conversational turn: no code changed, the answer is the result.
    await db.prompt.create({ data: { projectId, content: trimmed, role: "user", mode } });
    await db.prompt.create({
      data: {
        projectId,
        content: outcome.reply.trim(),
        role: "assistant",
        mode,
        modelId: outcome.modelId ?? "",
        modelLabel: outcome.modelLabel ?? "",
        ...(metadata === undefined ? {} : { metadata }),
      },
    });
    await recordExecutionLearning({
      userId,
      projectId,
      mode,
      approvedPlan: executionContext.approvedPlan,
      skillIds: skillContext?.ids,
      appliedPaths: [],
    });
    return {
      ok: true as const,
      prompt: { changes: [] },
      modelId: outcome.modelId,
      modelLabel: outcome.modelLabel,
      providerLabel: outcome.providerLabel,
      latencyMs: outcome.latencyMs,
      usage: outcome.usage,
      notice: outcome.notice,
      reply: outcome.reply.trim(),
      changedPaths: [] as string[],
      success: true as const,
    };
  }

  if (valid.length === 0) {
    await db.prompt.create({ data: { projectId, content: trimmed, role: "user", mode } });
    await db.prompt.create({
      data: {
        projectId,
        content: "I couldn't match my edits against the current files — try rephrasing the request.",
        role: "assistant",
        mode,
        modelId: outcome.modelId ?? "",
        modelLabel: outcome.modelLabel ?? "",
        error: "no usable changes",
      },
    });
    return { ok: false as const, error: "No usable changes from the agent." };
  }

  const prompt = await db.prompt.create({
    data: {
      projectId,
      content: trimmed,
      role: "user",
      mode,
      changes: {
        create: valid.map((e) => ({
          projectId,
          path: sanitizePath(e.path),
          before: e.before,
          after: e.after,
        })),
      },
    },
    include: { changes: true },
  });

  // Edits apply immediately — the chat is the driver, there is no Apply step.
  onEvent?.(`Applying ${prompt.changes.length} file change${prompt.changes.length === 1 ? "" : "s"}…`);
  for (const change of prompt.changes) {
    await db.projectFile.upsert({
      where: { projectId_path: { projectId, path: change.path } },
      create: { projectId, path: change.path, content: change.after },
      update: { content: change.after },
    });
  }
  await db.change.updateMany({
    where: { id: { in: prompt.changes.map((c) => c.id) } },
    data: { status: "applied", appliedAt: new Date() },
  });

  // The agent's own words in the thread, or a fallback summary of what changed.
  const applied = valid.map((e) => sanitizePath(e.path));
  for (const path of applied) {
    onEvent?.(`✓ wrote ${path}`);
  }
  const assistantText =
    outcome.reply?.trim() ||
    (applied.length
      ? `Done — updated ${applied.join(", ")}.`
      : "All set — no file changes were needed.");
  await db.prompt.create({
    data: {
      projectId,
      content: assistantText,
      role: "assistant",
      mode,
      modelId: outcome.modelId ?? "",
      modelLabel: outcome.modelLabel ?? "",
      ...(metadata === undefined ? {} : { metadata }),
    },
  });
  await recordExecutionLearning({
    userId,
    projectId,
    mode,
    approvedPlan: executionContext.approvedPlan,
    skillIds: skillContext?.ids,
    appliedPaths: applied,
  });

  return {
    ok: true as const,
    prompt,
    reply: outcome.reply,
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    providerLabel: outcome.providerLabel,
    latencyMs: outcome.latencyMs,
    usage: outcome.usage,
    plan: outcome.plan,
    suggestions: outcome.suggestions,
    skillIds: outcome.skillIds,
    usedFallback: outcome.usedFallback,
    creditsSpent: outcome.creditsSpent,
    freeTokensUsed: outcome.freeTokensUsed,
    freeTokensLeft: outcome.freeTokensLeft,
    freeExhausted: outcome.freeExhausted,
    notice: outcome.notice,
    changedPaths: applied,
    success: true as const,
  };
}

/** Apply a pending change: write `after` into the project file. */
export async function applyChange(userId: string, changeId: string) {
  const change = await db.change.findUnique({ where: { id: changeId }, include: { project: true } });
  if (!change || change.project.userId !== userId) return { ok: false as const, error: "not_found" };
  if (change.status !== "pending") return { ok: false as const, error: "already_applied" };

  await db.$transaction([
    db.projectFile.upsert({
      where: { projectId_path: { projectId: change.projectId, path: change.path } },
      create: { projectId: change.projectId, path: change.path, content: change.after },
      update: { content: change.after },
    }),
    db.change.update({
      where: { id: change.id },
      data: { status: "applied", appliedAt: new Date() },
    }),
  ]);
  return { ok: true as const };
}

/** Revert an applied change: restore `before` into the project file. */
export async function revertChange(userId: string, changeId: string) {
  const change = await db.change.findUnique({ where: { id: changeId }, include: { project: true } });
  if (!change || change.project.userId !== userId) return { ok: false as const, error: "not_found" };
  if (change.status !== "applied") return { ok: false as const, error: "not_applied" };

  await db.$transaction([
    db.projectFile.update({
      where: { projectId_path: { projectId: change.projectId, path: change.path } },
      data: { content: change.before },
    }),
    db.change.update({ where: { id: change.id }, data: { status: "reverted" } }),
  ]);
  return { ok: true as const };
}

/** Direct editor save. Returns null result object when not owned / bad path. */
export async function saveFile(userId: string, projectId: string, rawPath: string, content: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const path = sanitizePath(rawPath);
  if (!isValidProjectPath(path)) return { ok: false as const, error: "invalid_path" as const };

  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, content },
    update: { content },
  });
  return { ok: true as const };
}

export const PRESET_CSS_PATH = "src/index.css";

/** Apply a UI preset: rewrite src/index.css with the preset stylesheet. */
export async function applyPreset(userId: string, projectId: string, slug: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const preset = PRESETS.find((p) => p.slug === slug);
  if (!preset) return { ok: false as const, error: "unknown_preset" as const };
  const css = presetCss(preset);

  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path: PRESET_CSS_PATH } },
    create: { projectId, path: PRESET_CSS_PATH, content: css },
    update: { content: css },
  });
  return { ok: true as const, slug: preset.slug, name: preset.name, file: { path: PRESET_CSS_PATH, content: css } };
}

/** Service credentials a user has connected (counts per service only). */
export async function listServiceKeys(userId: string): Promise<Record<string, number>> {
  const keys = await db.serviceKey.findMany({ where: { userId }, select: { serviceSlug: true } });
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k.serviceSlug] = (counts[k.serviceSlug] ?? 0) + 1;
  return counts;
}

/** Add a credential for an integration. Returns the new counts. */
export async function addServiceKey(userId: string, serviceSlug: string, key: string, label: string) {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false as const, error: "Key is required." as const };
  await db.serviceKey.create({ data: { userId, serviceSlug, label: label.trim() || "Primary", key: trimmed } });
  const counts = await listServiceKeys(userId);
  return { ok: true as const, counts };
}

/** Remove all credentials for one integration. Returns new counts. */
export async function removeServiceKey(userId: string, serviceSlug: string) {
  await db.serviceKey.deleteMany({ where: { userId, serviceSlug } });
  const counts = await listServiceKeys(userId);
  return { ok: true as const, counts };
}