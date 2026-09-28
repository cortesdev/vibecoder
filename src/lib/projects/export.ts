import { strToU8, zipSync } from "fflate";

// ZIP export: stored project files → downloadable runnable project. Defensive
// by construction: paths are normalized POSIX relatives, traversal/duplicates
// rejected before creation, secrets skipped, total size capped so generation
// never balloons memory. fflate writes regular-file entries only.

export const EXPORT_MAX_BYTES = 20_000_000;

export class ExportError extends Error {
  path?: string;
  constructor(message: string, path?: string) {
    super(message);
    this.name = "ExportError";
    this.path = path;
  }
}

const SECRET_BASENAMES = new Set([".env", "credentials.json"]);
function isSecret(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    SECRET_BASENAMES.has(base)
  );
}

/** Normalize to a safe POSIX relative path. Throws ExportError otherwise. */
export function normalizeExportPath(raw: string): string {
  if (raw.includes("\0")) throw new ExportError("NUL byte in path", raw);
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
    throw new ExportError("drive-prefixed path", raw);
  }
  if (raw.startsWith("/")) throw new ExportError("absolute path", raw);
  const parts = raw.split("/").filter((seg) => seg !== "" && seg !== ".");
  if (parts.length === 0) throw new ExportError("empty path", raw);
  for (const seg of parts) {
    if (seg === "..") throw new ExportError("parent traversal", raw);
  }
  return parts.join("/");
}

/** Build the ZIP bytes. Throws ExportError naming the offending path. */
export function buildExportZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [rawPath, content] of Object.entries(files)) {
    const path = normalizeExportPath(rawPath);
    if (isSecret(path)) continue;
    if (entries[path] !== undefined) throw new ExportError(`duplicate path: ${path}`, rawPath);
    const bytes = strToU8(content);
    total += bytes.length;
    if (total > EXPORT_MAX_BYTES) {
      throw new ExportError(`project too large (${total} bytes, limit ${EXPORT_MAX_BYTES})`);
    }
    entries[path] = bytes;
  }
  if (Object.keys(entries).length === 0) throw new ExportError("nothing to export");
  return zipSync(entries, { level: 6 });
}

/** Attachment filename for Content-Disposition: lowercase slug, safe chars. */
export function exportFilename(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";
  return `${slug}.zip`;
}
