export interface FileEdit {
  path: string;
  /** Full current content of the file; empty string for a new file. */
  before: string;
  /** Full new content of the file. */
  after: string;
}

export type Files = Record<string, string>;

export interface Agent {
  /** Turn one prompt into a proposed set of file edits. Never mutates state. */
  run(prompt: string, files: Files): Promise<FileEdit[]>;
}

export function looksLikeJsx(path: string): boolean {
  return /\.(tsx|jsx)$/.test(path);
}