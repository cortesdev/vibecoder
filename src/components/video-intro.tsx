"use client";

// Video intro mask. Replicates the maloca homepage "home mask": a full-screen
// panel gating the site (like maloca's WithPreloader) with the hero's frosted
// dot-mask glass over an autoplaying YouTube video. The page stays hidden until
// the clip finishes, or the visitor clicks anywhere / presses Esc to skip.
//
// Exit reproduces maloca's preloader reveal — the black panel lifts up on the
// same cubic-bezier with a sagging (cloth-like) bottom edge that straightens
// out as it leaves.

import { useCallback, useEffect, useRef, useState } from "react";

export const VIDEO_INTRO_ID = "l-HqiSQJAPs";

// Mirror of maloca's Preloader: EXIT_EASE [0.76,0,0.24,1] over ~0.95s.
const EXIT_MS = 950;
const REDUCED_EXIT_MS = 320;
const EXIT_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";

// Bottom-edge sag profile and its keyframed amplitude (maloca's numbers).
const SAG = [0, 0.5, 1, 0.65, 1, 0.4, 0];
const AMP_TIMES = [0, 0.22, 0.45, 0.63, 0.78, 0.9, 1];
const AMP_VALUES = [0, 18, 10, 5, 2, 1, 0];

function wobblyBand(amp: number, w = 100, baseline = 100): string {
  // Straight top edge riding exactly on the panel's bottom, sagging *below* it
  // (overflow visible) so the bulge trails under the mask while it lifts.
  const pts = SAG.map((s, i) => ({
    x: (i / (SAG.length - 1)) * w,
    y: baseline + amp * s,
  }));
  let d = `M0,${baseline} L${w},${baseline} `;
  for (let i = SAG.length - 1; i > 0; i--) {
    const midX = (pts[i].x + pts[i - 1].x) / 2;
    const midY = (pts[i].y + pts[i - 1].y) / 2;
    d += `Q${pts[i].x},${pts[i].y} ${midX},${midY} `;
  }
  d += `L0,${baseline} Z`;
  return d;
}

function easedSeg(x: number, i: number, last: number): number {
  if (i === 0 || i === last) return 1 - Math.pow(1 - x, 3); // easeOut
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; // easeInOut
}

function sampleAmp(progress: number): number {
  for (let i = 0; i < AMP_TIMES.length - 1; i++) {
    if (progress <= AMP_TIMES[i + 1]) {
      const span = AMP_TIMES[i + 1] - AMP_TIMES[i] || 1;
      const seg = (progress - AMP_TIMES[i]) / span;
      const eased = easedSeg(seg, i, AMP_TIMES.length - 2);
      return AMP_VALUES[i] + (AMP_VALUES[i + 1] - AMP_VALUES[i]) * eased;
    }
  }
  return AMP_VALUES[AMP_VALUES.length - 1];
}

type Phase = "visible" | "exiting";

export default function VideoIntro() {
  const [phase, setPhase] = useState<Phase>("visible");
  const [gone, setGone] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const bandPathRef = useRef<SVGPathElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const exitedRef = useRef(false);
  const reducedRef = useRef(false);

  // Reduced-motion preference is read once (matchMedia may be absent in SSR/tests).
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  const dismiss = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    // Stop playback before the panel lifts — otherwise the promo keeps
    // playing (and looping) behind the reveal for its last second.
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
    // Only start the exit animation here. `setGone` fires when the animation
    // completes (in the exiting effect below) — unmounting here would skip it.
    setPhase("exiting");
  }, []);

  // Lock scrolling and watch for skip / natural end while the mask is up.
  useEffect(() => {
    if (gone) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Hard cap on how long the mask may hold the page: even if the video never
    // ends or never loads, the intro cannot trap the visitor past 10 seconds.
    const autoTimer = window.setTimeout(dismiss, 10_000);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "onStateChange" && msg.info === 0) dismiss();
      } catch {
        // non-YouTube message
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(autoTimer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [gone, dismiss]);

  // The reveal: lift the panel with the maloca easing while the bottom edge
  // sags through the same keyframed amplitude (rAF drives the path).
  useEffect(() => {
    if (phase !== "exiting") return;
    const duration = reducedRef.current ? REDUCED_EXIT_MS : EXIT_MS;
    const t0 = performance.now();

    if (panelRef.current) {
      const panel = panelRef.current;
      panel.style.transition = `transform ${duration}ms ${EXIT_EASE}`;
      void panel.getBoundingClientRect(); // commit the transition before moving
      panel.style.transform = "translateY(-101%)";
    }

    const applyBand = (t: number) => {
      const p = bandPathRef.current;
      if (!p) return;
      const amp = reducedRef.current ? 0 : sampleAmp(Math.min(1, t / EXIT_MS));
      p.setAttribute("d", wobblyBand(amp));
    };

    let raf = 0;
    const tick = (now: number) => {
      applyBand(now - t0);
      if (now - t0 < duration && typeof requestAnimationFrame === "function") {
        raf = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);

    const timer = window.setTimeout(() => setGone(true), duration);
    return () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [phase]);

  if (gone) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vibecoder intro video"
      className="fixed inset-0 z-[200] select-none overflow-hidden "
    >
      <div ref={panelRef} className="absolute inset-0 will-change-transform">
        {/* Autoplaying promo videos inside the mask — landscape on desktop,
            portrait on mobile, per the <source> media queries below. The
            element is full-bleed with object-fit: cover, so whichever source
            the browser picks crops to fill the screen with no letterboxing. */}
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          autoPlay
          muted
          playsInline
          poster=""
          onEnded={dismiss}
          style={{ objectFit: "cover" as const }}
        >
          <source
            src="https://ik.imagekit.io/17xxw7xjq/videos/vibecoder-promo-landscape.webm?updatedAt=1790252675645"
            type="video/webm"
            // Tablets included: only true phones (portrait-width) get the
            // vertical cut, everything wider gets landscape.
            media="(min-width: 481px)"
          />
          <source
            src="https://ik.imagekit.io/17xxw7xjq/videos/vibecoder-promo-vertical%20(1).webm?updatedAt=1790253969107"
            type="video/webm"
            media="(max-width: 480px)"
          />
        </video>

        {/* Home mask: frosted dot-mask glass over the video (maloca hero panel) */}
        <div
          className="pointer-events-none absolute inset-0"
          // style={{
          //   backdropFilter: "blur(12px) saturate(135%)",
          //   WebkitBackdropFilter: "blur(12px) saturate(135%)",
          //   WebkitMask:
          //     "repeating-radial-gradient(circle at 50% 50%, black 0, black 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px)",
          //   mask: "repeating-radial-gradient(circle at 50% 50%, black 0, black 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px)",
          //   opacity: 0.55,
          // }}
        />

        {/* <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="eyebrow">Free · open source · MIT</p>
          <p className="display mt-3 max-w-[820px]">
            The AI coding agent that lives on your desktop.
          </p>
        </div> */}
      </div>

      {/* Clickable overlay for dismiss - covers entire screen */}
      <div
        className="absolute inset-0 z-20"
        onClick={dismiss}
        style={{ cursor: "pointer" }}
      />

      {/* Chrome that stays fixed while the panel peels away */}
      {/* <div className="absolute left-6 top-6 z-30 flex items-center gap-2">
        <Image src="/vibe-logo.png" alt="" width={20} height={20} className="rounded-[5px]" priority />
        <span className="text-[17px] font-bold tracking-[-0.02em]">vibecoder</span>
      </div> */}

      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 px-6 pb-8">
        <span className="hidden text-[11px] uppercase tracking-[0.18em] text-white/45 sm:block">
          The intro ends on its own — or skip with a click / Esc
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="btn btn-secondary rounded-full border-white/20 bg-black/40 px-5 py-2 text-[13px] text-white backdrop-blur"
        >
          Skip intro
        </button>
      </div>

      {/* Sagging cloth bottom edge, mounted only as the mask lifts */}
      {phase === "exiting" && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ overflow: "visible" }}
          aria-hidden="true"
        >
          <path ref={bandPathRef} fill="var(--bg)" d={wobblyBand(0)} />
        </svg>
      )}
    </div>
  );
}