import { db } from "./db";
import type { ChatMessageDto, ChangeDto } from "@/components/projects/workspace-shared";

// One loader for a conversation thread. The project workspace and the
// chat-first home view both read history through here, so a thread renders
// identically wherever it is opened. The assistant row carries its own run
// account in metadata, so a reload shows the model that actually ran even
// when the free chain substituted.

interface RunMeta {
  attachments?: unknown;
  exportUrl?: unknown;
  changedPaths?: unknown;
  modelLabel?: unknown;
  providerLabel?: unknown;
  latencyMs?: unknown;
  tokens?: unknown;
  notice?: unknown;
}

function parseMeta(raw: string | null): RunMeta {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") return parsed as RunMeta;
  } catch {
    // Unparseable metadata degrades to the plain message.
  }
  return {};
}

function toChange(c: {
  id: string;
  path: string;
  status: string;
  before: string;
  after: string;
  createdAt: Date;
}): ChangeDto {
  return {
    id: c.id,
    path: c.path,
    status: c.status as "pending" | "applied" | "reverted",
    before: c.before,
    after: c.after,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function loadThread(projectId: string): Promise<ChatMessageDto[]> {
  const [rows, changes] = await Promise.all([
    db.prompt.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, take: 200 }),
    db.change.findMany({
      where: { projectId, promptId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return rows.map((r) => {
    const meta = parseMeta(r.metadata);
    const changedPaths = Array.isArray(meta.changedPaths)
      ? meta.changedPaths.filter((p): p is string => typeof p === "string")
      : [];
    return {
      id: r.id,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      mode: r.mode,
      modelLabel: typeof meta.modelLabel === "string" ? meta.modelLabel : r.modelLabel,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
      providerLabel: typeof meta.providerLabel === "string" ? meta.providerLabel : undefined,
      latencyMs: typeof meta.latencyMs === "number" ? meta.latencyMs : undefined,
      tokens: typeof meta.tokens === "number" ? meta.tokens : undefined,
      notice: typeof meta.notice === "string" ? meta.notice : undefined,
      exportUrl: typeof meta.exportUrl === "string" ? meta.exportUrl : undefined,
      changedCount: changedPaths.length > 0 ? changedPaths.length : undefined,
      changes: changes.filter((c) => c.promptId === r.id).map(toChange),
    };
  });
}
