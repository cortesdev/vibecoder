import { db } from "./db";
import { runModelPrompt } from "./engine";
import { isValidProjectPath, sanitizePath } from "./agent/paths";
import { getSkillCatalog } from "./agent/skill-catalog";
import { selectSkillIds, toSkillSummary, type SkillDefinition } from "./agent/skills";
import { getApprovedLearningContext, recordLearning } from "./learning";
import type { AgentAttachment, AgentPlanOptions, AgentRunContext } from "./agent/types";
import { PRESETS } from "./presets";
import { applyPresetCss } from "./presets/apply";
import { indexCss } from "./templates/shared";

import { filesFor, isChatTemplate } from "./templates/catalog";

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
      // A chat thread may legitimately start with no files; the agent adds
      // them on the first turn that needs code.
      files: isChatTemplate(templateId)
        ? undefined
        : { create: Object.entries(filesFor(templateId, trimmed)).map(([path, content]) => ({ path, content })) },
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
  agentKind: "auto" | "mock" = "auto",
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

  // History account: the caller passes static context (attachments, export
  // URL); the run outcome (routing, usage, changed paths) is merged here so
  // reload renders exactly what the live turn showed.
  function historyMetadata(extra: Record<string, unknown> = {}): string | undefined {
    if (metadata === undefined && Object.keys(extra).length === 0) return undefined;
    let base: Record<string, unknown> = {};
    try {
      const parsed: unknown = metadata ? JSON.parse(metadata) : {};
      if (parsed && typeof parsed === "object") base = parsed as Record<string, unknown>;
    } catch {
      base = {};
    }
    return JSON.stringify({ ...base, ...extra });
  }

  const outcome = await runModelPrompt({
    userId,
    projectId,
    modelId,
    prompt: trimmed,
    files,
    useFreeTokens,
    agentKind,
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
    const convoMeta = historyMetadata({
      modelId: outcome.modelId,
      modelLabel: outcome.modelLabel,
      providerLabel: outcome.providerLabel,
      latencyMs: outcome.latencyMs,
      tokens: outcome.usage?.totalTokens,
      notice: outcome.notice,
      changedPaths: [],
    });
    const assistantRow = await db.prompt.create({
      data: {
        projectId,
        content: outcome.reply.trim(),
        role: "assistant",
        mode,
        modelId: outcome.modelId ?? "",
        modelLabel: outcome.modelLabel ?? "",
        ...(convoMeta === undefined ? {} : { metadata: convoMeta }),
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
      assistantPromptId: assistantRow.id,
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
  const appliedMeta = historyMetadata({
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    providerLabel: outcome.providerLabel,
    latencyMs: outcome.latencyMs,
    tokens: outcome.usage?.totalTokens,
    notice: outcome.notice,
    changedPaths: applied,
  });
  const assistantRow = await db.prompt.create({
    data: {
      projectId,
      content: assistantText,
      role: "assistant",
      mode,
      modelId: outcome.modelId ?? "",
      modelLabel: outcome.modelLabel ?? "",
      ...(appliedMeta === undefined ? {} : { metadata: appliedMeta }),
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
    assistantPromptId: assistantRow.id,
  };
}

/** Merge a patch into a prompt row's metadata JSON. Ownership-checked. */
export async function updatePromptMetadata(userId: string, promptId: string, patch: Record<string, unknown>) {
  const row = await db.prompt.findUnique({ where: { id: promptId } });
  if (!row) return { ok: false as const, error: "not_found" as const };
  const project = await db.project.findUnique({ where: { id: row.projectId } });
  if (!project || project.userId !== userId) return { ok: false as const, error: "not_found" as const };
  let base: Record<string, unknown> = {};
  try {
    const parsed: unknown = row.metadata ? JSON.parse(row.metadata) : {};
    if (parsed && typeof parsed === "object") base = parsed as Record<string, unknown>;
  } catch {
    base = {};
  }
  await db.prompt.update({ where: { id: promptId }, data: { metadata: JSON.stringify({ ...base, ...patch }) } });
  return { ok: true as const };
}

/** Restore an exact file snapshot (last-working-revision safety net):
 *  upserts snapshot entries, deletes anything created after it. */
export async function restoreProjectFiles(
  userId: string,
  projectId: string,
  snapshot: Record<string, string>,
) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const current = new Set(project.files.map((f) => f.path));
  for (const [path, content] of Object.entries(snapshot)) {
    await db.projectFile.upsert({
      where: { projectId_path: { projectId, path } },
      create: { projectId, path, content },
      update: { content },
    });
  }
  for (const path of current) {
    if (!(path in snapshot)) await db.projectFile.deleteMany({ where: { projectId, path } });
  }
  return { ok: true as const, restored: Object.keys(snapshot).length };
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
  const saved = await saveProjectFile(userId, projectId, rawPath, content);
  if (!saved.ok && saved.error === "not_found") return { ok: false as const, error: "not_found" as const };
  if (!saved.ok) return { ok: false as const, error: "invalid_path" as const };
  return { ok: true as const };
}

/** Create a project file. Refuses invalid paths and occupied targets. */
export async function createProjectFile(userId: string, projectId: string, rawPath: string, content = "") {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const path = sanitizePath(rawPath);
  if (!isValidProjectPath(path)) return { ok: false as const, error: "invalid_path" as const };
  const existing = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path } } });
  if (existing) return { ok: false as const, error: "exists" as const };
  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, content },
    update: { content },
  });
  return { ok: true as const, path };
}

/** Conflict-checked save: when `expectedContent` is given and the stored
 *  bytes differ (edited elsewhere since the editor loaded), the write is
 *  refused with the current content instead of clobbering it. */
export async function saveProjectFile(
  userId: string,
  projectId: string,
  rawPath: string,
  content: string,
  expectedContent?: string,
) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const path = sanitizePath(rawPath);
  if (!isValidProjectPath(path)) return { ok: false as const, error: "invalid_path" as const };
  if (expectedContent !== undefined) {
    const current = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path } } });
    if (current && current.content !== expectedContent) {
      return { ok: false as const, error: "conflict" as const, conflict: true as const, current: current.content };
    }
  }
  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, content },
    update: { content },
  });
  return { ok: true as const, path };
}

/** Rename a file. Refuses invalid paths, missing sources, occupied targets. */
export async function renameProjectFile(userId: string, projectId: string, rawFrom: string, rawTo: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const from = sanitizePath(rawFrom);
  const to = sanitizePath(rawTo);
  if (!isValidProjectPath(from) || !isValidProjectPath(to)) {
    return { ok: false as const, error: "invalid_path" as const };
  }
  if (from === to) return { ok: true as const, path: to };
  const [source, target] = await Promise.all([
    db.projectFile.findUnique({ where: { projectId_path: { projectId, path: from } } }),
    db.projectFile.findUnique({ where: { projectId_path: { projectId, path: to } } }),
  ]);
  if (!source) return { ok: false as const, error: "not_found" as const };
  if (target) return { ok: false as const, error: "exists" as const };
  await db.projectFile.deleteMany({ where: { projectId, path: from } });
  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path: to } },
    create: { projectId, path: to, content: source.content },
    update: { content: source.content },
  });
  return { ok: true as const, path: to };
}

/** Delete a project file. */
export async function deleteProjectFile(userId: string, projectId: string, rawPath: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const path = sanitizePath(rawPath);
  if (!isValidProjectPath(path)) return { ok: false as const, error: "invalid_path" as const };
  await db.projectFile.deleteMany({ where: { projectId, path } });
  return { ok: true as const, path };
}

export const PRESET_CSS_PATH = "src/index.css";

export interface PresetUndoRecord {
  previousCss: string;
  previousPresetId: string | null;
  appliedCss: string;
  presetId: string;
  consumed?: boolean;
}

function readUndo(metadata: string | null): PresetUndoRecord | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { presetUndo?: PresetUndoRecord };
    return parsed.presetUndo ?? null;
  } catch {
    return null;
  }
}

/** Apply a UI preset: rewrite only the theme section of src/index.css, persist
 *  the selection, and record exact-undo bytes on the chat message. */
export async function applyProjectPreset(userId: string, projectId: string, slug: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };
  const preset = PRESETS.find((p) => p.slug === slug);
  if (!preset) return { ok: false as const, error: "unknown_preset" as const };

  const current = project.files.find((f) => f.path === PRESET_CSS_PATH)?.content;
  let nextCss: string;
  let previousCss: string;
  if (current === undefined) {
    // No stylesheet yet: create the full base with this preset's theme.
    previousCss = "";
    nextCss = indexCss(preset.vars);
  } else {
    try {
      ({ nextCss, previousCss } = applyPresetCss(current, slug));
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "apply failed" };
    }
  }

  await db.projectFile.upsert({
    where: { projectId_path: { projectId, path: PRESET_CSS_PATH } },
    create: { projectId, path: PRESET_CSS_PATH, content: nextCss },
    update: { content: nextCss },
  });
  await db.project.update({ where: { id: projectId }, data: { activePresetId: preset.slug } });
  const undo: PresetUndoRecord = {
    previousCss,
    previousPresetId: (project as { activePresetId?: string | null }).activePresetId ?? null,
    appliedCss: nextCss,
    presetId: preset.slug,
  };
  await db.prompt.create({
    data: {
      projectId,
      content: `Applied the ${preset.name} theme. You can undo this from the Presets panel.`,
      role: "assistant",
      mode: "build",
      modelLabel: "",
      metadata: JSON.stringify({ presetUndo: undo }),
    },
  });
  return { ok: true as const, slug: preset.slug, name: preset.name };
}

/** Undo the latest preset application. Restores exact bytes + prior selection.
 *  Refuses (rather than overwriting) when the CSS changed since the apply. */
export async function undoProjectPreset(userId: string, projectId: string) {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false as const, error: "not_found" as const };

  const recent = await db.prompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const action = recent.map((r) => ({ row: r, undo: readUndo(r.metadata) })).find((x) => x.undo && !x.undo.consumed);
  if (!action || !action.undo) return { ok: false as const, error: "Nothing to undo." as const };
  const undo = action.undo;

  const current = project.files.find((f) => f.path === PRESET_CSS_PATH)?.content;
  if (current !== undo.appliedCss) {
    return {
      ok: false as const,
      error: "The stylesheet changed after the theme was applied, so undo refuses to overwrite newer work. Re-apply a theme to start over." as const,
    };
  }

  if (undo.previousCss === "") {
    await db.projectFile.deleteMany({ where: { projectId, path: PRESET_CSS_PATH } });
  } else {
    await db.projectFile.upsert({
      where: { projectId_path: { projectId, path: PRESET_CSS_PATH } },
      create: { projectId, path: PRESET_CSS_PATH, content: undo.previousCss },
      update: { content: undo.previousCss },
    });
  }
  await db.project.update({ where: { id: projectId }, data: { activePresetId: undo.previousPresetId } });
  await db.prompt.update({
    where: { id: action.row.id },
    data: { metadata: JSON.stringify({ presetUndo: { ...undo, consumed: true } }) },
  });
  await db.prompt.create({
    data: {
      projectId,
      content: "Undid the theme change — the previous stylesheet is back byte-for-byte.",
      role: "assistant",
      mode: "build",
      modelLabel: "",
    },
  });
  return { ok: true as const, presetId: undo.previousPresetId };
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