import type { Agent, AgentPlanOptions, AgentRunContext, FileEdit, Files } from "./types";
import { isValidProjectPath, sanitizePath } from "./paths";

/**
 * Deterministic in-memory agent: zero API keys, zero cost, fully testable.
 * Each run edits the project's first App-ish file (or creates src/App.tsx),
 * appending an obviously-marked comment containing the prompt.
 */
export class MockAgent implements Agent {
  async plan(prompt: string, _files: Files, options: AgentPlanOptions) {
    return {
      edits: [],
      plan: `Approach: Review the request and the existing project before changing code.\nPlan: Apply the smallest coherent change for: ${prompt}\nRisks: Verify behavior, accessibility, and regression coverage after the change.`,
      reply: "Here is a small plan to review before I make changes.",
      suggestions: [
        "Which existing behavior must remain unchanged?",
        "What should I verify first?",
        "Are there constraints I should include?",
      ],
      skillIds: options.skills.slice(0, 3).map((skill) => skill.id),
    };
  }

  async run(prompt: string, files: Files, context: AgentRunContext = {}) {
    const path =
      Object.keys(files).find((p) => /App\.(tsx|jsx)$/.test(p)) ??
      Object.keys(files)[0] ??
      "src/App.tsx";

    const before = files[path] ?? "";
    const contextNote = [context.approvedPlan, context.answer].filter((value) => value?.trim()).join("\n");
    const note = contextNote ? `${prompt}\n${contextNote}` : prompt;
    const marker = /\.(tsx|jsx)$/.test(path)
      ? `{/* vibecoder mock: ${note} */}`
      : `// vibecoder mock: ${note}`;
    const after = `${before.replace(/\s+$/, "")}\n${marker}\n`;

    const edit: FileEdit = {
      path: sanitizePath(path),
      before,
      after,
    };
    if (!isValidProjectPath(edit.path)) return { edits: [] };
    return after === before ? { edits: [] } : { edits: [edit] };
  }
}