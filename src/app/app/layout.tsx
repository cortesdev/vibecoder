import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="sticky top-0 z-40 border-b"
        style={{ borderColor: "var(--hairline)", background: "color-mix(in srgb, var(--bg) 75%, transparent)" }}
      >
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <Link href="/app" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.02em]">
            <span aria-hidden="true" className="inline-block h-[18px] w-[18px] rounded-[5px]" style={{ background: "var(--accent)" }} />
            vibecoder
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="muted">Signed in as {user.name || user.email}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-secondary btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}