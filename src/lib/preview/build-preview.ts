// Pure preview bundling: no DOM, no React, no network at import time. The
// browser pane (preview-pane.tsx) and the share route both consume this, and
// the template gate bundles every catalog template through it in Node.

export type Files = Record<string, string>;

// React pinned to the version generated projects declare. One place to bump.
export const PREVIEW_REACT_VERSION = "19.2.8";

// Bare imports are redirected to a CDN so the bundle can load React without
// node_modules. Only these four specs may escape the vault.
export const CDN: Record<string, string> = {
  react: `https://esm.sh/react@${PREVIEW_REACT_VERSION}`,
  "react-dom": `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}`,
  "react-dom/client": `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}/client`,
  "react/jsx-runtime": `https://esm.sh/react@${PREVIEW_REACT_VERSION}/jsx-runtime`,
};

export type EsbuildLike = {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles?: { path: string; text: string }[];
    errors: { text: string }[];
  }>;
};

export function norm(p: string): string {
  return p.replace(/^\/+/, "").replace(/^\.\//, "");
}

export function loaderFor(path: string): "tsx" | "ts" | "jsx" | "js" | "css" | "json" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "ts";
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

/** Entry script from index.html, defaulting to the Vite convention. */
export function findEntry(files: Files): string {
  const html = files["index.html"] ?? "";
  const m = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
  return norm(m?.[1] ?? "/src/main.tsx");
}

/** Readable one-line summary of an esbuild failure. */
export function formatBuildError(e: unknown): string {
  if (e instanceof Error) return e.message.split("\n").slice(0, 8).join("\n");
  return "Preview build failed.";
}

function vfsPlugin(esbuild: {
  // Minimal structural type for the plugin host (esbuild or esbuild-wasm).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}, files: Files) {
  return {
    name: "vibecoder-vfs",
    setup(build: {
      onResolve: (opts: unknown, cb: (args: { path: string; importer: string }) => unknown) => void;
      onLoad: (opts: unknown, cb: (args: { path: string }) => unknown) => void;
    }) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const spec = norm(args.path);
        if (spec in CDN) return { path: CDN[spec], external: true };
        if (args.importer === "") {
          if (files[spec] !== undefined) return { path: spec, namespace: "vfs" };
          for (const candidate of ["src/main.tsx", "src/App.tsx", "src/index.tsx", "index.ts", "index.js"]) {
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
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (args) => {
        const contents = files[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `Missing file "${args.path}" in the project` }] };
        }
        return { contents, loader: loaderFor(args.path) };
      });
      void esbuild;
    },
  };
}

/** Bundle the entry to JS. Throws a readable, file-aware error on failure. */
export async function bundleJs(esbuild: EsbuildLike, files: Files, entry?: string): Promise<string> {
  const target = entry ?? findEntry(files);
  let result;
  try {
    result = await esbuild.build({
      entryPoints: [target],
      plugins: [vfsPlugin(esbuild, files)],
      bundle: true,
      write: false,
      // An output path is required even for in-memory builds: without it a
      // CSS import has nowhere to go and the whole bundle fails.
      outfile: "bundle.js",
      // ESM, not IIFE: bare React specs are externalized to absolute CDN URLs,
      // and only <script type="module"> can import absolute URLs at runtime.
      // (IIFE would emit require("https://…") calls that throw in browsers.)
      format: "esm",
      jsx: "automatic",
      loader: { ".tsx": "tsx", ".ts": "ts", ".jsx": "jsx", ".js": "js", ".css": "css", ".json": "json" },
      absWorkingDir: "/",
      logLevel: "silent",
    });
  } catch (e) {
    throw new Error(formatBuildError(e));
  }
  const js = result.outputFiles?.find((f) => f.path.endsWith(".js"))?.text ?? "";
  if (!js) throw new Error(`No JavaScript was produced for entry "${target}".`);
  return js;
}

/** Escape a string for insertion into HTML text/attribute content. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Restrictive preview CSP: no plugins/frames/objects, scripts only inline
 *  (our bundle) or https (the React CDN), no parent/cookie access. The
 *  sandboxed iframe (no allow-same-origin) enforces the rest. frame-ancestors
 *  is deliberately absent: it is ignored in <meta> and only logs noise. */
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; " +
  "img-src data: https: blob:; media-src data: https: blob:; font-src https: data:; connect-src https: wss:; " +
  "base-uri 'none'; form-action 'none';";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

const BUNDLED_MARKER = "<!-- vibecoder-bundled -->";

/** Inject the bundle into a complete HTML document. Never halfway: a page
 *  without the bundle script is returned untouched so the caller can report
 *  it instead of showing an empty iframe as success. */
export function assembleHtml(files: Files, js: string): string {
  const fallback = '<!doctype html><html><body><div id="root"></div></body></html>';
  const html = files["index.html"] ?? fallback;
  const withCsp = html.includes("http-equiv=\"Content-Security-Policy\"")
    ? html
    : html.replace(/<head[^>]*>/i, (m) => `${m}\n${CSP_META}`);
  const stripped = withCsp.replace(/<script\b[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/gi, "");
  const injected = `${BUNDLED_MARKER}<script type="module">\n${js}\n</script>`;
  if (stripped === withCsp && !/<script[^>]*>/i.test(withCsp)) {
    return stripped.replace("</body>", `${injected}</body>`);
  }
  if (!stripped.includes(BUNDLED_MARKER) && /<\/body>/i.test(stripped)) {
    return stripped.replace(/<\/body>/i, `${injected}</body>`);
  }
  return stripped;
}

/** Full pipeline: entry → bundle → document. Throws readable errors. An
 *  optional per-preview nonce prepends the one-way error-reporting bridge. */
export async function buildPreviewSnapshot(
  esbuild: EsbuildLike,
  files: Files,
  opts: { nonce?: string; onBridge?: (nonce: string) => string } = {},
): Promise<string> {
  let js = await bundleJs(esbuild, files);
  if (opts.nonce) {
    const render = opts.onBridge ?? ((await import("./bridge")).bridgeListenerSnippet);
    js = `${render(opts.nonce)}\n${js}`;
  }
  const doc = assembleHtml(files, js);
  if (!doc.includes(BUNDLED_MARKER)) {
    throw new Error("Preview assembly failed: bundle script is missing from the document.");
  }
  return doc;
}
