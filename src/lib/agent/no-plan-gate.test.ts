import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the retired plan-review gate.
//
// The user-facing panel ("Review plan / No files change yet / Edit the proposed
// plan / Change request") was deleted. A panel like that never renders in the
// mock success path, so the only test that can catch it silently coming back is
// a scan of the files on the run path. If this fails, do not delete the test —
// remove the reintroduced gate instead. The system prompt's rule ("never start
// the conversation with a plan review") and MockAgent's on-demand plan() stay;
// only an up-front approval gate is forbidden.
const RUN_PATH_FILES = [
  "src/app/api/app/projects/[id]/agent/route.ts",
  "src/lib/orchestrator.ts",
  "src/components/projects/project-builder.tsx",
  "src/components/projects/chat-messages.tsx",
  "src/components/app/chat-home.tsx",
  "src/components/app/model-picker.tsx",
];

const FORBIDDEN = [
  /review\s+plan/i,
  /proposed\s+plan/i,
  /edit\s+the\s+proposed\s+plan/i,
  /pendingPlan/i,
  /change\s+request/i,
];

describe("no plan-review gate on the run path", () => {
  it.each(RUN_PATH_FILES)("%s carries no plan-approval UI or state", (relative) => {
    const source = readFileSync(path.join(process.cwd(), relative), "utf8");
    for (const pattern of FORBIDDEN) {
      expect(source, `${relative} must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it("keeps the system prompt's rule against opening with a plan review", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/agent/llm.ts"), "utf8");
    expect(source).toMatch(/Never start the conversation with a plan review/i);
  });
});
