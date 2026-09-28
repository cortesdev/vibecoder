import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { findOwnedProject } from "@/lib/projects";
import { currentUser } from "@/lib/auth";
import { checkFreeReadiness } from "@/lib/readiness";
import ProjectBuilder, { type ChatMessageDto } from "@/components/projects/project-builder";
import DeleteProject from "@/components/projects/delete-project";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const noticeParam = typeof sp.notice === "string" ? sp.notice : "";
  const fallbackParam = sp.fallback === "1";
  const errorParam = typeof sp.error === "string" ? sp.error : "";
  const initialPrompt = typeof sp.prompt === "string" ? decodeURIComponent(sp.prompt) : "";
  const initialMode = typeof sp.mode === "string" ? sp.mode : "build";
  const initialModelId = typeof sp.model === "string" ? sp.model : "";

  const user = await currentUser();
  if (!user) notFound();

  const [project, readiness] = await Promise.all([
    findOwnedProject(user.id, id),
    checkFreeReadiness(user.id),
  ]);
  if (!project) notFound();

  const errorNotice = errorParam ? decodeURIComponent(errorParam) : "";
  const notice = errorNotice
    ? `Build failed: ${errorNotice}`
    : noticeParam
      ? fallbackParam
        ? `Out of credits — ran the free model instead. ${noticeParam}`
        : noticeParam
      : undefined;

  // Chat thread: user prompts and assistant replies, each with the changes
  // proposed alongside it (matched by promptId).
  const [rows, allChanges] = await Promise.all([
    db.prompt.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.change.findMany({
      where: { projectId: project.id, promptId: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const messages: ChatMessageDto[] = rows.map((r) => ({
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    mode: r.mode,
    modelLabel: r.modelLabel,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    changes: (r.id ? allChanges.filter((c) => c.promptId === r.id) : []).map((c) => ({
      id: c.id,
      path: c.path,
      status: c.status as "pending" | "applied" | "reverted",
      before: c.before,
      after: c.after,
      createdAt: c.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col px-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mt-0.5 truncate text-xl font-bold tracking-[-0.02em]">{project.name}</h1>
        </div>
        <DeleteProject projectId={project.id} />
      </div>

      <ProjectBuilder
        projectId={project.id}
        initialFiles={project.files.map((f) => ({ path: f.path, content: f.content }))}
        initialChanges={project.changes.map((c) => ({
          id: c.id,
          path: c.path,
          status: c.status as "pending" | "applied" | "reverted",
          before: c.before,
          after: c.after,
          createdAt: c.createdAt.toISOString(),
        }))}
        initialMessages={messages}
        initialNotice={notice}
        initialPrompt={initialPrompt}
        initialMode={initialMode}
        initialModelId={initialModelId}
        initialPresetId={project.activePresetId}
        readiness={readiness}
      />
    </div>
  );
}
