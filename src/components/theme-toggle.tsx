"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// Theme switch. The DOM (<html data-theme>) is the store: the inline pre-paint
// script in the root layout applies the saved value before first paint (no
// flash), and this component reads it via useSyncExternalStore. Dark default.
const LISTENERS = new Set<() => void>();

function subscribe(listener: () => void) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

function getSnapshot(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): "dark" {
  return "dark";
}

export default function ThemeToggle({ className = "sidebar-link w-full text-left" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("vc-theme", next);
    } catch {
      // private mode: session-only theme
    }
    LISTENERS.forEach((l) => l());
  }, []);

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
