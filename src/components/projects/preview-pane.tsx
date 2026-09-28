"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PreviewToolbar, { type PreviewViewport } from "./preview-toolbar";
import {
  assembleHtml,
  bundleJs,
  findEntry,
  formatBuildError,
  type EsbuildLike,
  type Files,
} from "@/lib/preview/build-preview";
import { acceptBridgeEvent, bridgeListenerSnippet } from "@/lib/preview/bridge";

// Browser-only live preview. Bundles stored files with esbuild-wasm (loaded
// once per session), caches identical bundles by content hash, and renders the
// document via iframe srcDoc. No localhost server, no network fetch of project
// code — the only network the preview itself touches is the React CDN.

// esbuild-wasm initializes once per browser session.
let esbuildPromise: Promise<EsbuildLike> | null = null;
function loadEsbuild(): Promise<EsbuildLike> {
  esbuildPromise ??= import("esbuild-wasm").then(async (m) => {
    await m.initialize({ wasmURL: "/esbuild/esbuild.wasm" });
    return m as unknown as EsbuildLike;
  });
  return esbuildPromise;
}

// Bounded in-memory bundle cache keyed by content hash. The per-document
// nonce is applied AFTER the cache lookup, so identical sources hit.
const jsCache = new Map<string, string>();
const CACHE_LIMIT = 20;

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cacheGet(key: string): string | undefined {
  const hit = jsCache.get(key);
  if (hit !== undefined) {
    jsCache.delete(key);
    jsCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, js: string): void {
  jsCache.set(key, js);
  while (jsCache.size > CACHE_LIMIT) {
    const oldest = jsCache.keys().next().value;
    if (oldest === undefined) break;
    jsCache.delete(oldest);
  }
}

function newNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const REBUILD_DEBOUNCE_MS = 350;

export default function PreviewPane({ files }: { files: Files }) {
  const entry = useMemo(() => findEntry(files), [files]);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [building, setBuilding] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [interactive, setInteractive] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // A fresh nonce per build binds bridge reports to this exact document.
  const [docNonce, setDocNonce] = useState(() => newNonce());
  // Refresh bypasses the debounce; file edits never do.
  const immediateRef = useRef(false);

  function refreshNow() {
    immediateRef.current = true;
    setNonce((n) => n + 1);
  }

  useEffect(() => {
    let alive = true;
    // Refresh is immediate; file edits debounce so typing never rebuilds.
    const wait = immediateRef.current ? 0 : REBUILD_DEBOUNCE_MS;
    immediateRef.current = false;
    async function runBuild() {
      setBuilding(true);
      setErr("");
      // A new document means new runtime errors; stale ones must not linger.
      setRuntimeErrors([]);
      const id = newNonce();
      try {
        const fingerprint = `${entry}\n${await sha256(JSON.stringify(files))}`;
        let js = cacheGet(fingerprint);
        if (js === undefined) {
          const esbuild = await loadEsbuild();
          js = await bundleJs(esbuild, files);
          cacheSet(fingerprint, js);
        }
        const doc = assembleHtml(files, `${bridgeListenerSnippet(id)}\n${js}`);
        if (!doc.includes("vibecoder-bundled")) {
          throw new Error("Preview assembly failed: bundle script is missing from the document.");
        }
        if (alive) {
          setDocNonce(id);
          setHtml(doc);
          setInteractive(false);
        }
      } catch (e) {
        if (alive) {
          setHtml(null);
          setErr(formatBuildError(e));
        }
      } finally {
        if (alive) setBuilding(false);
      }
    }
    const t = setTimeout(() => void runBuild(), wait);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [entry, nonce, files]);

  // One-way error bridge: the preview reports outward; nothing is accepted in.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const accepted = acceptBridgeEvent(event, docNonce, frameRef.current?.contentWindow);
      if (accepted) {
        setRuntimeErrors((prev) => (prev.includes(accepted.message) ? prev : [...prev, accepted.message].slice(-5)));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [docNonce]);

  function openInTab() {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const mobile = viewport === "mobile";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewToolbar
        viewport={viewport}
        onViewport={setViewport}
        onRefresh={refreshNow}
        onOpenTab={openInTab}
        interactive={interactive}
        onInteract={() => setInteractive(true)}
        building={building}
        canOpen={html !== null}
      />
      <div className="relative flex-1 h-full overflow-auto p-3" style={{ maxHeight: "82vh", overflowY: "scroll", background: "var(--stage)" }}>
        <div
          className={`relative flex h-full overflow-hidden ${mobile ? "mx-auto max-w-[390px] rounded-2xl" : "w-full rounded-lg"}`}
          style={{ background: "#00000020", height: mobile ? 844 : "95vh", minHeight: mobile ? 844 : 0 }}
        >
          {html && (
            <iframe
              ref={frameRef}
              srcDoc={html}
              title="Project preview"
              className="h-full w-full border-0"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          )}
          {err && !html && (
            <div className="absolute inset-0 overflow-auto p-4" role="alert">
              <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
                Preview could not build
              </p>
              <pre className="mono mt-2 max-w-full overflow-auto rounded-lg p-3 text-[12px]" style={{ background: "var(--terminal)", color: "var(--ink-2)" }}>
                {err}
              </pre>
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setNonce((n) => n + 1)}>
                Retry preview
              </button>
            </div>
          )}
          {!html && !err && (
            <div className="absolute inset-0 grid place-items-center p-4">
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                {building ? "Building preview…" : "No preview available"}
              </p>
            </div>
          )}
        </div>
        {runtimeErrors.length > 0 && html && (
          <div className="mx-auto mt-2 max-w-full rounded-lg p-3 text-[12px]" style={{ background: "var(--bg-inset)" }} role="status">
            <p className="font-semibold" style={{ color: "var(--warn)" }}>
              The preview built, but the app threw {runtimeErrors.length === 1 ? "an error" : `${runtimeErrors.length} errors`} at runtime:
            </p>
            <ul className="mono mt-1 space-y-0.5" style={{ color: "var(--ink-2)" }}>
              {runtimeErrors.map((m, i) => (
                <li key={i}>› {m}</li>
              ))}
            </ul>
          </div>
        )}
        {!interactive && !err && html && (
          <button
            type="button"
            className="absolute inset-0 grid place-items-center border-0"
            style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={() => setInteractive(true)}
            aria-label="Click to interact with the preview"
          >
            <span className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-lg" style={{ background: "rgba(12,12,16,0.85)" }}>
              Click to test
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
