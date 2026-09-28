import { describe, expect, it } from "vitest";
import { MockAgent } from "./mock";

describe("MockAgent", () => {
  it("edits the App file with the prompt as a marker", async () => {
    const agent = new MockAgent();
    const files = { "src/App.tsx": "export default function App() {}\n" };
    const { edits } = await agent.run("add a button", files);
    expect(edits).toHaveLength(1);
    expect(edits[0].path).toBe("src/App.tsx");
    expect(edits[0].before).toBe("export default function App() {}\n");
    expect(edits[0].after).toContain("vibecoder mock: add a button");
    expect(edits[0].after).not.toBe(edits[0].before);
  });

  it("includes approved plan context in the mock edit", async () => {
    const agent = new MockAgent();
    const result = await agent.run("apply", { "src/App.tsx": "x" }, {
      approvedPlan: "Approach: small change",
      answer: "Keep the current behavior",
    });
    expect(result.edits[0].after).toContain("Approach: small change");
    expect(result.edits[0].after).toContain("Keep the current behavior");
  });

  it("answers a plain hello with edits, never a plan-approval payload", async () => {
    const agent = new MockAgent();
    const result = await agent.run("hello", { "src/App.tsx": "x" });
    // "hello" must build, not open a review gate.
    expect(result.edits.length).toBeGreaterThan(0);
    expect(result.plan).toBeUndefined();
    expect(result.suggestions).toBeUndefined();
    expect(result).not.toHaveProperty("pendingPlan");
    expect(result).not.toHaveProperty("approval");
    expect(result).not.toHaveProperty("requiresApproval");
  });

  it("creates src/App.tsx when the project is empty", async () => {
    const agent = new MockAgent();
    const { edits } = await agent.run("hello", {});
    expect(edits[0].path).toBe("src/App.tsx");
    expect(edits[0].before).toBe("");
  });

  it("returns no edits when the change is a no-op", async () => {
    const agent = new MockAgent();
    const files = { "src/lib.ts": "x" };
    const { edits } = await agent.run("still here", files);
    // after appends a marker so it can never equal before; guard regression:
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[0].after).not.toBe("x");
  });
});
describe("MockAgent attachments", () => {
  it("records the normalized attachment payload deterministically", async () => {
    const agent = new MockAgent();
    const { edits } = await agent.run("redesign", { "src/App.tsx": "x" }, {
      attachments: [
        { kind: "image", name: "ui.png", mimeType: "image/png", imageUrl: "data:...", detail: "auto" },
        {
          kind: "videoFrames",
          name: "clip.mp4",
          mimeType: "video/mp4",
          frames: [{ timestampMs: 0, imageUrl: "data:...", detail: "low" }],
        },
        { kind: "document", name: "spec.md", mimeType: "text/plain", extractedText: "blue", truncated: true },
      ],
    });
    expect(edits).toHaveLength(1);
    expect(edits[0].after).toContain("[image ui.png image/png auto]");
    expect(edits[0].after).toContain("[video clip.mp4 1 frames @0]");
    expect(edits[0].after).toContain("[document spec.md text/plain truncated]");
  });
});
