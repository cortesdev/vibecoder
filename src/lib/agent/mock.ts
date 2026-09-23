import type { Agent, FileEdit, Files } from "./types";
import { isValidProjectPath, sanitizePath } from "./paths";

/**
 * Deterministic in-memory agent: zero API keys, zero cost, fully testable.
 * Each run edits the project's first App-ish file (or creates src/App.tsx),
 * appending an obviously-marked comment containing the prompt.
 */
export class MockAgent implements Agent {
  async run(prompt: string, files: Files): Promise<FileEdit[]> {
    const path =
      Object.keys(files).find((p) => /App\.(tsx|jsx)$/.test(p)) ??
      Object.keys(files)[0] ??
      "src/App.tsx";

    const before = files[path] ?? "";
    const marker = /\.(tsx|jsx)$/.test(path)
      ? `{/* vibecoder mock: ${prompt} */}`
      : `// vibecoder mock: ${prompt}`;
    const after = `${before.replace(/\s+$/, "")}\n${marker}\n`;

    const edit: FileEdit = {
      path: sanitizePath(path),
      before,
      after,
    };
    if (!isValidProjectPath(edit.path)) return [];
    return after === before ? [] : [edit];
  }
}