"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Theme switch. Persists to localStorage("vc-theme"); the no-FOUC inline
// script in the root layout applies it before first paint. Default: dark.
export default function ThemeToggle({ className = "sidebar-link w-full text-left" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vc-theme", next);
    } catch {
      // private mode: session-only theme
    }
  }

  return (
    <button type="button" className={className} onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
