import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { checkFreeReadiness } from "@/lib/readiness";
import HomeComposer from "@/components/app/home-composer";
import { FolderOpen } from "lucide-react";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const rawInitial = typeof sp.prompt === "string" ? sp.prompt : Array.isArray(sp.prompt) ? sp.prompt[0] : "";
  const initialPrompt = rawInitial.slice(0, 4000);

  const user = await currentUser();
  if (!user && initialPrompt.trim()) {
    const { redirect } = await import("next/navigation");
    redirect(`/login?next=${encodeURIComponent(`/agent?prompt=${encodeURIComponent(initialPrompt)}`)}`);
  }
  const readiness = user ? await checkFreeReadiness(user.id) : [];
  const projects = user
    ? await db.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, updatedAt: true },
        take: 6,
      })
    : [];

  return (
    <main className="flex flex-1 flex-col items-center px-6 pb-16 pt-[10vh]">
      <p className="hero-rise eyebrow" style={{ "--i": 0 } as React.CSSProperties}>
        vibecoder
      </p>
      <h1
        className="hero-rise mt-3 text-center text-[34px] font-bold tracking-[-0.02em]"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        {greeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
      </h1>
      <p
        className="hero-rise muted mt-2 text-center text-[15px]"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        Describe something to build — pick a model, hit enter, it builds right away.
      </p>

      <div className="hero-rise mt-8 w-full" style={{ "--i": 3 } as React.CSSProperties}>
        <HomeComposer readiness={readiness} initialPrompt={initialPrompt} />
      </div>

      {projects.length > 0 && (
        <section className="mt-16 w-full max-w-[720px]" aria-label="Recent projects">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
            Recent projects
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/agent/projects/${p.id}`} className="sidebar-link !p-3" style={{ boxShadow: "inset 0 0 0 1px var(--hairline)", borderRadius: 12 }}>
                  <FolderOpen size={15} aria-hidden="true" />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto shrink-0 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
