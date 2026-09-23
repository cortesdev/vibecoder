import Link from "next/link";
import Wordmark from "./wordmark";

export default function SiteNav() {
  return (
    <nav className="nav-material" aria-label="Main">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
        <Wordmark href="/" label="Go to homepage" />
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
