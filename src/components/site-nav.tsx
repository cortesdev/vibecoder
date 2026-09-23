import Link from "next/link";

export default function SiteNav() {
  return (
    <nav className="nav-material" aria-label="Main">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.02em]">
          <span aria-hidden="true" className="inline-block h-[18px] w-[18px] rounded-[5px]" style={{ background: "var(--accent)" }} />
          vibecoder
        </Link>
        <div className="flex items-center gap-6 text-sm" style={{ color: "var(--ink-2)" }}>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70">
            GitHub
          </a>
          <a href="#faq" className="hover:opacity-70">
            Docs
          </a>
              <a href="/agent" className="hover:opacity-70">
            Agent
          </a>
          <a href="#download" className="btn btn-primary btn-sm">
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
