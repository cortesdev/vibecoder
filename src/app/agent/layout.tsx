import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import ThemeToggle from "@/components/theme-toggle";
import SidebarProject from "@/components/projects/sidebar-project";
import SignOutButton from "@/components/sign-out-button";
import { Cog, Plus, ArrowUpCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
    take: 20,
  });

  return (
    <div className="flex min-h-dvh overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex w-[248px] shrink-0 flex-col border-r min-h-0"
        style={{ borderColor: "var(--hairline)", background: "var(--bg-raised)" }}
        aria-label="App navigation"
      >
        <div className="flex h-14 items-center px-4">
          <Link href="/agent" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.02em]">
            <span aria-hidden="true" className="inline-block h-[18px] w-[18px] rounded-[5px]">
              <img src="/vibe-logo.png" alt="" className="h-full w-full" />
            </span>
            vibecoder
          </Link>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 text-[14px]">
          <Link href="/agent" className="sidebar-link">
            <Plus size={16} aria-hidden="true" /> New project
          </Link>
          <Link href="/#upgrade" className="sidebar-link">
            <ArrowUpCircle size={16} aria-hidden="true" /> Upgrade
          </Link>
        </nav>

        <div className="mt-6 px-4 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
            Projects
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3 text-[14px]" aria-label="Projects">
          {projects.length === 0 ? (
            <p className="px-2 py-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
              No projects yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {projects.map((p) => (
                <SidebarProject key={p.id} id={p.id} name={p.name} />
              ))}
            </ul>
          )}
        </nav>

        <div className="border-t px-3 py-3" style={{ borderColor: "var(--hairline)" }}>
          <Link href="/agent/settings" className="sidebar-link">
            <Cog size={16} aria-hidden="true" /> Settings
          </Link>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
