"use client";

// ---------------------------------------------------------------------------
// landing-motion.tsx — shared animation primitives for the landing page.
//
// Ports the Relay landing's motion language (scroll reveals, word-stagger
// headlines, animated numbers, cursor ring, spotlight cards) onto Vibecoder's
// accent token, so both themes keep working. All copy stays with the callers;
// this file carries behavior only.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

export function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Pure scroll-progress helper (0..1), unit-tested separately. */
export function pageProgress(
  scrollY: number,
  scrollHeight: number,
  innerHeight: number,
): number {
  const max = scrollHeight - innerHeight;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / max));
}

export function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  // No IntersectionObserver (old browser, jsdom): reveal immediately instead
  // of syncing state inside the effect below.
  const [seen, setSeen] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>(0.12);
  return (
    <div
      ref={ref}
      className={`lm-rv${seen ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function Words({
  text,
  start = 0.15,
  step = 0.06,
  className = "",
}: {
  text: string;
  start?: number;
  step?: number;
  className?: string;
}) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} aria-hidden="true">
          <span className="lm-w">
            <span style={{ animationDelay: `${start + i * step}s` }}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

export function AnimatedNumber({
  value,
  run = true,
  duration = 1200,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number;
  run?: boolean;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [v, setV] = useState(() => (prefersReduced() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (!run || prefersReduced()) return;
    const t0 = performance.now();
    const a = from.current;
    const b = value;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const cur = a + (b - a) * (1 - Math.pow(1 - p, 3));
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, run, duration]);
  const shown = v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <>
      {prefix}
      {shown}
      {suffix}
    </>
  );
}

/** Spotlight position for hover-glow cards: onMouseMove={spot}. */
export function spot(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
}

export function CursorRing() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }
    const pos = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;
    const move = (e: globalThis.MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      el.classList.add("on");
      const t = e.target as HTMLElement | null;
      const hot = t && t.closest ? t.closest("button, a, [data-hover]") : null;
      el.classList.toggle("big", !!hot);
    };
    const leave = () => el.classList.remove("on");
    const loop = () => {
      cur.x += (pos.x - cur.x) * 0.16;
      cur.y += (pos.y - cur.y) * 0.16;
      el.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="lm-ring" aria-hidden="true" />;
}
