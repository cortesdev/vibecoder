"use client";

import { useEffect, useRef, useState } from "react";
import Wordmark from "./wordmark";
import { pageProgress } from "./landing-motion";

// In-page anchors tracked for the active-link highlight.
const TRACKED = ["download", "faq"];

export default function SiteNav() {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY || document.documentElement.scrollTop;
      setScrolled(y > 12);
      barRef.current?.style.setProperty(
        "--p",
        String(
          pageProgress(
            y,
            document.documentElement.scrollHeight,
            window.innerHeight,
          ),
        ),
      );
      let cur = "";
      for (const id of TRACKED) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) {
          cur = id;
        }
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <nav className="nav-material" aria-label="Main">
      <div
        className={`mx-auto flex max-w-[1100px] items-center justify-between px-6 transition-all ${
          scrolled ? "h-12" : "h-14"
        }`}
      >
        <Wordmark href="/" label="Go to homepage" />
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden items-center gap-6 text-sm sm:flex" style={{ color: "var(--ink-2)" }}>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-70">
              GitHub
            </a>
            <a
              href="#faq"
              className={active === "faq" ? "nav-link-active hover:opacity-70" : "hover:opacity-70"}
            >
              Docs
            </a>
            <a href="/agent" className="hover:opacity-70">
              Agent
            </a>
          </div>
          <a href="#download" className="btn btn-primary btn-sm">
            Download
          </a>
        </div>
      </div>
      <div ref={barRef} className="nav-progress" aria-hidden="true" />
    </nav>
  );
}
