"use client";

import { ExternalLink, Monitor, MousePointerClick, RotateCw, Smartphone } from "lucide-react";

// Preview toolbar: Refresh (immediate rebuild), Desktop/Mobile viewport,
// Open in tab, Click-to-interact. Controlled and stateless so keyboard focus
// and viewport switches never trigger a rebuild by themselves.

export type PreviewViewport = "desktop" | "mobile";

export default function PreviewToolbar({
  viewport,
  onViewport,
  onRefresh,
  onOpenTab,
  interactive,
  onInteract,
  building,
  canOpen,
}: {
  viewport: PreviewViewport;
  onViewport: (v: PreviewViewport) => void;
  onRefresh: () => void;
  onOpenTab: () => void;
  interactive: boolean;
  onInteract: () => void;
  building: boolean;
  canOpen: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
      style={{ borderColor: "var(--hairline)", background: "var(--bg-inset)" }}
      role="toolbar"
      aria-label="Preview controls"
    >
      <button
        type="button"
        aria-label="Refresh preview"
        title="Rebuild preview now"
        className="chip !px-1.5"
        onClick={onRefresh}
        disabled={building}
      >
        <RotateCw size={14} className={building ? "animate-spin" : ""} aria-hidden="true" />
      </button>
      <div className="flex items-center gap-1" role="tablist" aria-label="Preview viewport">
        <button
          type="button"
          role="tab"
          aria-selected={viewport === "desktop"}
          aria-label="Desktop preview"
          title="Desktop preview"
          className={`chip !px-1.5 ${viewport === "desktop" ? "" : "opacity-50"}`}
          onClick={() => onViewport("desktop")}
        >
          <Monitor size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewport === "mobile"}
          aria-label="Mobile preview"
          title="Mobile preview"
          className={`chip !px-1.5 ${viewport === "mobile" ? "" : "opacity-50"}`}
          onClick={() => onViewport("mobile")}
        >
          <Smartphone size={14} aria-hidden="true" />
        </button>
      </div>
      <span className="mono min-w-0 flex-1 truncate px-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
        {building ? "building…" : interactive ? "interactive — clicks reach the app" : "preview — click to interact"}
      </span>
      {!interactive && (
        <button
          type="button"
          className="chip !px-1.5"
          aria-label="Click to interact with the preview"
          title="Click to interact with the preview"
          onClick={onInteract}
          disabled={!canOpen}
        >
          <MousePointerClick size={14} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="chip !px-1.5"
        aria-label="Open preview in new tab"
        title="Open preview in new tab"
        onClick={onOpenTab}
        disabled={!canOpen}
      >
        <ExternalLink size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
