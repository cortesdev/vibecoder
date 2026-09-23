import Link from "next/link";
import { notFound } from "next/navigation";
import { findOwnedProject } from "@/lib/projects";
import { currentUser } from "@/lib/auth";
import { getBalance, ensureWallet } from "@/lib/credits";
import { ensureFreeWallet, getFreeBalance } from "@/lib/freewallet";
import ProjectBuilder from "@/components/projects/project-builder";
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

  const user = await currentUser();
  if (!user) notFound();

  const [project, balance, freeTokens] = await Promise.all([
    findOwnedProject(user.id, id),
    ensureWallet(user.id).then(() => getBalance(user.id)),
    ensureFreeWallet(user.id).then(() => getFreeBalance(user.id)),
  ]);
  if (!project) notFound();

  const notice = noticeParam
    ? fallbackParam
      ? `Out of credits — ran the free model instead. ${noticeParam}`
      : noticeParam
    : undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/agent" className="text-xs muted hover:opacity-70">
            ← All projects
          </Link>
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
        initialNotice={notice}
        balance={balance}
        freeTokens={freeTokens}
      />
    </div>
  );
}
