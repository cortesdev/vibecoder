import { createTwoFilesPatch } from "diff";

/** Unified diff of a file change, using the file path as the diff header. */
export function unifiedDiff(path: string, before: string, after: string): string {
  return createTwoFilesPatch(
    `a/${path}`,
    `b/${path}`,
    before,
    after,
    "",
    "",
    { context: 3 },
  );
}