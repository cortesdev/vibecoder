"use client";

import { useSyncExternalStore } from "react";

export interface Platform {
  id: string;
  label: string;
  note?: string;
  href: string;
}

export const DESKTOP_PLATFORMS: Platform[] = [
  { id: "mac-arm64", label: "macOS", note: "Apple Silicon", href: "/releases/Vibecoder-1.0.0-arm64-mac.dmg" },
  { id: "mac-x64", label: "macOS", note: "Intel", href: "/releases/Vibecoder-1.0.0-x64-mac.dmg" },
  { id: "win-x64", label: "Windows", note: "x64", href: "/releases/Vibecoder-1.0.0-x64-win.exe" },
  { id: "linux-deb", label: "Linux", note: ".deb", href: "/releases/Vibecoder-1.0.0-amd64.deb" },
  { id: "linux-rpm", label: "Linux", note: ".rpm", href: "/releases/Vibecoder-1.0.0-x86_64.rpm" },
];

export function detectPlatform(userAgent: string): Platform | null {
  const ua = userAgent.toLowerCase();
  if (ua.includes("mac")) {
    // Apple Silicon vs Intel is not in the UA; default to Apple Silicon.
    return DESKTOP_PLATFORMS[0];
  }
  if (ua.includes("win")) return DESKTOP_PLATFORMS[2];
  if (ua.includes("linux") && !ua.includes("android")) return DESKTOP_PLATFORMS[3];
  return null;
}

// Platform detection without setState-in-effect: read the UA through
// useSyncExternalStore so SSR renders the safe default and hydration swaps it.
const clientSubscribe = (cb: () => void) => {
  // UA never changes after load; no subscription needed.
  void cb;
  return () => {};
};
const emptySnapshot = "";
function getServerSnapshot() {
  return emptySnapshot;
}

function useDetectedPlatform(): Platform {
  const ua = useSyncExternalStore(
    clientSubscribe,
    () => (typeof navigator === "undefined" ? emptySnapshot : navigator.userAgent),
    getServerSnapshot,
  );
  if (!ua) return DESKTOP_PLATFORMS[0];
  return detectPlatform(ua) ?? DESKTOP_PLATFORMS[0];
}

export default function DownloadButtons({ variant = "hero" }: { variant?: "hero" | "list" }) {
  const primary = useDetectedPlatform();

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-3">
        <a href={primary.href} className="btn btn-primary btn-lg" data-testid="primary-download">
          Download for {primary.label}
          {primary.note ? <span className="muted-3 text-sm text-black font-normal">({primary.note})</span> : null}
        </a>
        <p className="muted-3 text-[13px]">
          Free &amp; open source · macOS, Windows, Linux ·{" "}
          <a href="#all-downloads" className="underline hover:opacity-70" style={{ color: "var(--ink-2)" }}>
            all platforms
          </a>
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list" id="all-downloads">
      {DESKTOP_PLATFORMS.map((p) => (
        <li key={p.id}>
          <a
            href={p.href}
            className="card flex items-center justify-between px-5 py-4 transition-transform hover:-translate-y-0.5"
            style={p.id === primary.id ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : undefined}
          >
            <span>
              <span className="block font-semibold">{p.label}</span>
              {p.note && <span className="muted-3 block text-[13px]">{p.note}</span>}
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Download ↓
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
