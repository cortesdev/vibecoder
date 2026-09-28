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
      plan: `Approach: Build directly from the request without an upfront review gate.\nPlan: Apply the smallest coherent change for: ${prompt}\nRisks: Only pause for a true blocker that needs the user's decision.`,
      reply: "Building now — I'll only ask if a decision truly needs you.",
      suggestions: [],
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
    const attachmentNote = (context.attachments ?? [])
      .map((a) =>
        a.kind === "image"
          ? `[image ${a.name} ${a.mimeType} ${a.detail}]`
          : a.kind === "videoFrames"
            ? `[video ${a.name} ${a.frames.length} frames @${a.frames.map((f) => f.timestampMs).join(",")}]`
            : `[document ${a.name} ${a.mimeType}${a.truncated ? " truncated" : ""}]`,
      )
      .join("\n");
    const note = [prompt, contextNote, attachmentNote].filter((value) => value?.trim()).join("\n");
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