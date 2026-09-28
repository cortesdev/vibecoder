import { bundleJs, formatBuildError, type Files } from "./build-preview";

// Node-side project validation for the orchestrator: bundles the stored
// files with esbuild-wasm (bundled binary, no browser, no network beyond the
// already-known CDN specs which are external and unresolved at build time).
// Returns file-attributed diagnostics the editor can display per path.

export interface ValidationError {
  path?: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

let esbuildPromise: Promise<{
  build: (options: Record<string, unknown>) => Promise<{ outputFiles?: { path: string; text: string }[]; errors: { text: string }[] }>;
}> | null = null;

async function loadEsbuild() {
  esbuildPromise ??= import("esbuild-wasm").then(async (m) => {
    await (m as unknown as { initialize: () => Promise<void> }).initialize();
    return m as unknown as {
      build: (options: Record<string, unknown>) => Promise<{ outputFiles?: { path: string; text: string }[]; errors: { text: string }[] }>;
    };
  });
  return esbuildPromise;
}

function attributeErrors(raw: string): ValidationError[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((message) => {
      const m = message.match(/^(?:vfs:)?([^:\s]+\.(?:tsx?|jsx?|css|json))(.*)$/);
      return m ? { path: m[1], message } : { message };
    });
}

export async function validateProject(files: Files): Promise<ValidationResult> {
  const esbuild = await loadEsbuild();
  try {
    await bundleJs(esbuild, files);
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: attributeErrors(formatBuildError(e)) };
  }
}
