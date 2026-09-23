/**
 * Path sandbox: an accepted path is a relative repo path that stays inside
 * the project. No absolute paths, no `..`, no empty segments, no backslashes.
 */
export function isValidProjectPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

/** Normalizes separators so edits can't smuggle backslashes in as separators. */
export function sanitizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}