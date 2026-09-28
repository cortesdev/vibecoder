import { describe, expect, it, vi } from "vitest";

// The mock seam returns before any db/credit access, but the module graph is
// evaluated on import, so stub the client that would otherwise open a socket.
vi.mock("./db", () => ({ db: { userKey: { findUnique: async () => null } } }));

import { runModelPrompt } from "./engine";

// The run path (engine → MockAgent) is what a hello actually traverses. It must
// return real edits and never a plan-approval payload, before or after it is
// serialized for the client (JSON drops undefined, so this mirrors the wire).
describe("runModelPrompt mock seam", () => {
  it("answers hello with edits and no plan/approval field on the wire", async () => {
    const outcome = await runModelPrompt({
      userId: "u1",
      projectId: "p1",
      modelId: undefined,
      prompt: "hello",
      files: { "src/App.tsx": "x" },
      agentKind: "mock",
      run: (agent) => agent.run("hello", { "src/App.tsx": "x" }),
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.edits?.length).toBeGreaterThan(0);
    expect(outcome.modelId).toBe("mock");

    const wire = JSON.parse(JSON.stringify(outcome)) as Record<string, unknown>;
    for (const key of ["plan", "pendingPlan", "approval", "requiresApproval", "suggestions"]) {
      expect(wire, `wire payload must not carry ${key}`).not.toHaveProperty(key);
    }
  });
});
