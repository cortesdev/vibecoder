import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { checkFreeReadiness } from "@/lib/readiness";
import { loadThread } from "@/lib/chat";
import ChatHome from "@/components/app/chat-home";
import NewProjectPicker from "@/components/projects/new-project-picker";
import { FolderOpen } from "lucide-react";
import type { ChatMessageDto } from "@/components/projects/workspace-shared";

// Chat-first home. The conversation is the page; a project is the storage
// behind it and the user never has to make one to ask a question. Resuming
// the latest thread keeps a browser tab from silently starting over.

export default async function AgentHome({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const rawModel = typeof sp.model === "string" ? sp.model : "";

  const user = await currentUser();

  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center px-6 pb-16 pt-[10vh]">
        <p className="hero-rise eyebrow" style={{ "--i": 0 } as React.CSSProperties}>vibecoder</p>
        <h1 className="hero-rise mt-3 text-center text-[34px] font-bold tracking-[-0.02em]" style={{ "--i": 1 } as React.CSSProperties}>
          Ask for anything.
        </h1>
        <p className="hero-rise muted mt-2 text-center text-[15px]" style={{ "--i": 2 } as React.CSSProperties}>
          Sign in to start a conversation that builds real files.
        </p>
        <Link
          href="/login"
          className="hero-rise mt-8 rounded-xl px-5 py-2.5 text-[15px] font-medium"
          style={{ "--i": 3, background: "var(--accent)", color: "var(--bg)" } as React.CSSProperties}
        >
          Sign in
        </Link>
      </main>
    );
  }

  const [readiness, recent, latest] = await Promise.all([
    checkFreeReadiness(user.id),
    db.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
      take: 6,
    }),
    db.project.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  const messages: ChatMessageDto[] = latest ? await loadThread(latest.id) : [];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<p className="muted p-6 text-[13px]">Loading your chat…</p>}>
        <ChatHome
          initialThread={latest}
          initialMessages={messages}
          readiness={readiness}
          initialModelId={rawModel || undefined}
        />
      </Suspense>

      <section className="mx-auto w-full max-w-[720px] px-4 pb-10" aria-label="Recent threads">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
          Recent
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {recent.map((p) => (
            <li key={p.id}>
              <Link
                href={`/agent/projects/${p.id}`}
                className="sidebar-link !p-3"
                style={{ boxShadow: "inset 0 0 0 1px var(--hairline)", borderRadius: 12 }}
              >
                <FolderOpen size={15} aria-hidden="true" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Suspense>
            <NewProjectPicker />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
