import Link from "next/link";
import { notFound } from "next/navigation";
import { findOwnedProject } from "@/lib/projects";
import { currentUser } from "@/lib/auth";
import ProjectBuilder from "@/components/projects/project-builder";
import DeleteProject from "@/components/projects/delete-project";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) notFound();

  const project = await findOwnedProject(user.id, id);
  if (!project) notFound();

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link href="/app" className="text-xs muted hover:opacity-70">
            ← All projects
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em]">{project.name}</h1>
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
      />
    </>
  );
}