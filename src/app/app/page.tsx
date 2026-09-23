import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import NewProjectForm from "@/components/projects/new-project-form";

export default async function DashboardPage() {
  const user = await currentUser();
  const projects = user
    ? await db.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: { files: { select: { id: true } } },
      })
    : [];

  return (
    <>
      <h1 className="text-3xl font-bold tracking-[-0.02em]">
        {user?.name ? `Hi, ${user.name.split(" ")[0]}` : "Your projects"}
      </h1>
      <p className="mt-2 text-sm muted">
        Pick a project to open the agent, or start a new one.
      </p>

      <div className="mt-8 rounded-xl p-5" style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
        <h2 className="text-[15px] font-semibold">New project</h2>
        <p className="mb-4 mt-1 text-sm muted">
          Starts from a Vite + React scaffold. The agent edits files from your prompts.
        </p>
        <NewProjectForm />
      </div>

      <section className="mt-10" aria-label="Projects">
        {projects.length === 0 ? (
          <p className="muted">
            No projects yet. Create your first one above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/projects/${p.id}`}
                  className="block rounded-xl p-5 transition-transform"
                  style={{ background: "var(--bg-raised)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="mt-1 text-xs muted">
                    {p.files.length} file{p.files.length === 1 ? "" : "s"}
                  </div>
                  <span className="mt-3 inline-block text-sm" style={{ color: "var(--accent)" }}>
                    Open agent →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 text-sm muted">
        Curious how it works? See the{" "}
        <Link href="/agent" className="underline underline-offset-2 hover:opacity-70">
          agent page
        </Link>
        .
      </p>
    </>
  );
}