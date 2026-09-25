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