"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Hammer,
  Monitor,
  MonitorCog,
  MousePointerClick,
  RotateCw,
  Smartphone,
} from "lucide-react";
import type { OnLoadArgs, OnResolveArgs, Plugin } from "esbuild-wasm";

// Bare imports are redirected to a CDN (esm.sh) so the browser can load
// React without node_modules. Pinned to the same versions the scaffold uses.
const CDN: Record<string, string> = {
  react: "https://esm.sh/react@19.2.8",
  "react-dom": "https://esm.sh/react-dom@19.2.8",
  "react-dom/client": "https://esm.sh/react-dom@19.2.8/client",
  "react/jsx-runtime": "https://esm.sh/react@19.2.8/jsx-runtime",
};

type Files = Record<string, string>;

let esbuildPromise: Promise<typeof import("esbuild-wasm")> | null = null;
function loadEsbuild() {
  esbuildPromise ??= import("esbuild-wasm").then(async (m) => {
    await m.initialize({ wasmURL: "/esbuild/esbuild.wasm" });
    return m;
  });
  return esbuildPromise;
}

function loaderFor(path: string) {
  if (path.endsWith(".tsx")) return "tsx" as const;
  if (path.endsWith(".ts")) return "ts" as const;
  if (path.endsWith(".jsx")) return "jsx" as const;
  if (path.endsWith(".js")) return "js" as const;
  if (path.endsWith(".css")) return "css" as const;
  if (path.endsWith(".json")) return "json" as const;
  return "ts" as const;
}

// Vault keys never carry a leading slash (paths like `src/main.tsx`), so
// normalize everything before matching so relative/absolute specs line up.
function norm(p: string): string {
  return p.replace(/^\/+/, "").replace(/^\.\//, "");
}

function resolveCandidates(dir: string, spec: string): string[] {
  const segments = dir.split("/");
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") segments.pop();
    else segments.push(seg);
  }
  const base = segments.join("/");
  return [
    base,
    `${base}.tsx`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.jsx`,
    `${base}/index.ts`,
    `${base}/index.js`,
  ];
}

function findEntry(files: Files): string {
  const html = files["index.html"] ?? "";
  const m = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
  return norm(m?.[1] ?? "/src/main.tsx");
}

async function buildPreview(files: Files, entry: string): Promise<string> {
  const esbuild = await loadEsbuild();
  const plugin: Plugin = {
    name: "vibecoder-vfs",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args: OnResolveArgs) => {
        const spec = norm(args.path);
        if (spec in CDN) return { path: CDN[spec], external: true };
        if (args.importer === "") {
          if (files[spec] !== undefined) return { path: spec, namespace: "vfs" };
          for (const candidate of [
            "src/main.tsx",
            "src/App.tsx",
            "src/index.tsx",
            "index.ts",
            "index.js",
          ]) {
            if (files[candidate] !== undefined) return { path: candidate, namespace: "vfs" };
          }
          return { path: spec, namespace: "vfs" };
        }
        if (args.path.startsWith("/")) {
          return files[spec] !== undefined ? { path: spec, namespace: "vfs" } : null;
        }
        if (args.path.startsWith(".")) {
          const dir = args.importer.slice(0, args.importer.lastIndexOf("/"));
          for (const candidate of resolveCandidates(dir, args.path)) {
            if (files[candidate] !== undefined) return { path: candidate, namespace: "vfs" };
          }
        }
        return null;
      });
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (args: OnLoadArgs) => {
        const contents = files[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `Missing file "${args.path}" in the vault` }] };
        }
        return { contents, loader: loaderFor(args.path) };
      });
    },
  };

  const result = await esbuild.build({
    entryPoints: [entry],
    plugins: [plugin],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "App",
    jsx: "automatic",
    loader: { ".tsx": "tsx", ".ts": "ts", ".jsx": "jsx", ".js": "js", ".css": "css", ".json": "json" },
    absWorkingDir: "/",
    logLevel: "silent",
  });
  const outputs = result.outputFiles ?? [];
  const js = outputs.find((f) => f.path.endsWith(".js"))?.text ?? "";
  if (!js) throw new Error("No JavaScript was produced.");

  const html = files["index.html"] ?? '<!doctype html><html><body><div id="root"></div></body></html>';
  let out = html.replace(/<script\b[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/gi, "");
  if (!/<script[^>]*type="module">/.test(out) && !/<script[^>]*>/i.test(out)) {
    out = out.replace("</body>", `<script>\n${js}\n</script></body>`);
  }
  return out;
}

function errmsg(e: unknown): string {
  return e instanceof Error ? e.message : "Preview build failed.";
}

interface PreviewPaneProps {
  files: Files;
  projectId?: string;
}

/**
 * Live preview: either proxies to a real Vite dev server (when running)
 * or falls back to static esbuild-wasm bundling in the browser.
 */
export default function PreviewPane({ files, projectId }: PreviewPaneProps) {
  const entry = findEntry(files);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [building, setBuilding] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<"stopped" | "starting" | "running" | "error">("stopped");
  const [useServer, setUseServer] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setBuilding(true);
      setErr("");
      
      // If we have a projectId, check if server is running
      if (projectId) {
        try {
          const res = await fetch(`/api/app/projects/${projectId}/server`);
          const data = await res.json();
          if (data.success && data.server) {
            setServerUrl(data.server.url);
            setServerStatus(data.server.status as any);
            setUseServer(data.server.status === "running");
            
            // If server is running, fetch the HTML from it
            if (data.server.status === "running" && data.server.url) {
              try {
                const htmlRes = await fetch(`${data.server.url}/`);
                if (htmlRes.ok) {
                  const htmlContent = await htmlRes.text();
                  if (alive) {
                    setHtml(htmlContent);
                    setInteractive(false);
                  }
                }
              } catch (fetchErr) {
                console.warn("Failed to fetch from server, falling back to static build:", fetchErr);
                // Fall through to static build
              }
            }
          }
        } catch (e) {
          console.warn("Failed to check server status:", e);
        }
      }
      
      // Fallback to static build if no server or server not running
      if (!useServer) {
        try {
          const out = await buildPreview(files, entry);
          if (alive) {
            setHtml(out);
            setInteractive(false);
          }
        } catch (e) {
          if (alive) setErr(errmsg(e));
        } finally {
          if (alive) setBuilding(false);
        }
      } else {
        setBuilding(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [entry, nonce, files, projectId, useServer]);

  // Poll server status every 2 seconds when we have a projectId
  useEffect(() => {
    if (!projectId) return;
    
    let alive = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/app/projects/${projectId}/server`);
        const data = await res.json();
        if (data.success && data.server) {
          setServerUrl(data.server.url);
          setServerStatus(data.server.status as any);
          setUseServer(data.server.status === "running");
          
          // If server is running and we have a URL, fetch fresh content
          if (data.server.status === "running" && data.server.url && alive) {
            try {
              const htmlRes = await fetch(`${data.server.url}/`);
              if (htmlRes.ok) {
                const htmlContent = await htmlRes.text();
                if (alive) {
                  setHtml(htmlContent);
                }
              }
            } catch (fetchErr: any) {
              // Ignore fetch errors, server might be restarting
              console.warn("Failed to fetch from server:", fetchErr?.message);
            }
          }
        }
      } catch (e: any) {
        // Ignore polling errors
        console.warn("Server polling error:", e?.message);
      }
    }, 2000);
    
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [projectId]);

  function openInTab() {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Browser chrome */}
      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
        style={{ borderColor: "var(--hairline)", background: "var(--bg-inset)" }}
      >
        <div className="flex items-center gap-0.5">
          <button type="button" className="chip !px-1.5" aria-label="Back" disabled title="Back">
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
          <button type="button" className="chip !px-1.5" aria-label="Forward" disabled title="Forward">
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chip !px-1.5"
            aria-label="Refresh"
            title="Rebuild preview"
            onClick={() => setNonce((n) => n + 1)}
            disabled={building}
          >
            <RotateCw size={14} className={building ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Preview viewport">
          <button
            type="button"
            role="tab"
            aria-selected={!mobile}
            aria-label="Desktop preview"
            title="Desktop preview"
            className={`chip !px-1.5 ${!mobile ? "" : "opacity-50"}`}
            onClick={() => setMobile(false)}
          >
            <Monitor size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobile}
            aria-label="Mobile preview"
            title="Mobile preview"
            className={`chip !px-1.5 ${mobile ? "" : "opacity-50"}`}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={14} aria-hidden="true" />
          </button>
        </div>
        <div
          className="mono flex min-w-0 flex-1 items-center rounded-md border px-2 py-1 text-[11px]"
          style={{ borderColor: "var(--hairline)", background: "var(--bg-inset)" }}
        >
          <span style={{ color: "var(--ink-3)" }}>/</span>
          <span className="ml-1 min-w-0 flex-1 truncate" style={{ color: "var(--ink-2)" }}>
            {entry}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="chip !px-1.5"
            aria-label="Virtual machine status"
            title="Static preview — built in your browser"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: "var(--good)" }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--good)" }} />
            </span>
          </button>
          <button
            type="button"
            className="chip !px-1.5"
            aria-label="Build with agent"
            title="Ask the agent to build this project"
            onClick={async () => {
              if (!projectId) return;
              try {
                // Convert files Record<string, string> to object format
                const filesObj = Object.fromEntries(
                  Object.entries(files).map(([path, content]) => [path, content])
                );
                const res = await fetch(`/api/app/projects/${projectId}/server`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ files: filesObj })
                });
                if (!res.ok) throw new Error("Failed to start server");
              } catch (error) {
                console.error("Failed to start server:", error);
                // Optionally show a toast or notification
              }
            }}
            style={{ color: "var(--accent)" }}
          >
            <Hammer size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chip !px-1.5"
            aria-label="Restart computer"
            title="Rebuild preview"
            onClick={() => setNonce((n) => n + 1)}
            disabled={building}
          >
            <MonitorCog size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="chip !px-1.5"
            aria-label="Open in new tab"
            title="Open preview in new tab"
            onClick={openInTab}
            disabled={!html}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 h-full overflow-auto p-3" style={{ maxHeight: "82vh", overflowY: "scroll", background: "var(--stage)" }}>
        <div
          className={`relative flex h-full overflow-hidden ${mobile ? "mx-auto max-w-[390px] rounded-2xl" : "w-full rounded-lg"}`}
          style={{ background: "#00000020", height: mobile ? 844 : "95vh", minHeight: mobile ? 844 : 0 }}
        >
          {html && (
            <iframe
              srcDoc={html}
              title="Project preview"
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
            />
          )}
          {err && (
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.25)]">
              <pre className="mono max-w-full overflow-auto rounded-lg p-3 text-[12px]" style={{ background: "var(--terminal)", color: "var(--accent)" }}>
                {err}
              </pre>
            </div>
          )}
          {(!html && !err) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
              <div className="text-center">
                <p className="text-[14px] font-medium" style={{ color: "var(--ink-2)" }}>No preview available</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>
                  {projectId ? "Start the dev server to see your app" : "Open a project to preview"}
                </p>
              </div>
              {projectId && (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold text-white shadow-lg"
                  style={{ background: "var(--accent)" }}
                  onClick={async () => {
                    try {
                      const filesObj = Object.fromEntries(
                        Object.entries(files).map(([path, content]) => [path, content])
                      );
                      const res = await fetch(`/api/app/projects/${projectId}/server`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ files: filesObj })
                      });
                      if (!res.ok) throw new Error("Failed to start server");
                    } catch (error) {
                      console.error("Failed to start server:", error);
                    }
                  }}
                  disabled={building}
                >
                  {building ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                      Starting server...
                    </>
                  ) : (
                    <>
                      <Hammer size={16} aria-hidden="true" />
                      Start Dev Server
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        {!interactive && !err && html && (
          <button
            type="button"
            className="absolute inset-0 grid place-items-center border-0"
            style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={() => setInteractive(true)}
            aria-label="Click to test the preview"
          >
            <span className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-lg" style={{ background: "rgba(12,12,16,0.85)" }}>
              <MousePointerClick size={15} aria-hidden="true" />
              Click to test
            </span>
          </button>
        )}
      </div>
    </div>
  );
}