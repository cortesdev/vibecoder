import type { Metadata } from "next";
import SiteNav from "@/components/site-nav";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agent",
  description:
    "Vibecoder Agent — sign in with Google, create a project, and let the agent write and edit your React files. Every edit is a reviewable change.",
};

export default function AgentPage() {
  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto w-full max-w-[1100px] px-6 pb-24">
        <section className="pt-20 pb-14 text-center">
          <p className="eyebrow">vibecoder agent</p>
          <h1 className="display mt-3">
            Your ideas, as React apps.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg muted">
            Sign in with Google, create a project, and let the agent generate and
            edit your React files. Every change shows up as a diff you can apply
            or revert — nothing lands behind your back.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="btn btn-primary btn-lg">
              Open your projects
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              Sign in with Google
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Agent features">
          {[
            {
              title: "Project folders",
              body: "Create a named project and it starts from a clean Vite React scaffold — the files live in your account, ready to edit.",
            },
            {
              title: "Chat that edits",
              body: "Tell the agent what to build. It answers with concrete file edits, not just advice.",
            },
            {
              title: "Review before apply",
              body: "Every edit is proposed as a diff. Apply the ones you want, revert the ones you don't — one click each.",
            },
          ].map((f) => (
            <article key={f.title} className="card p-6">
              <h2 className="text-[15px] font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm muted">{f.body}</p>
            </article>
          ))}
        </section>

        <p className="mt-12 text-center text-xs muted-3">
          The Vibecoder agent is free while it is in preview.
        </p>
      </main>
    </>
  );
}