import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./diff";

describe("unifiedDiff", () => {
  it("produces a unified diff with file headers", () => {
    const d = unifiedDiff("src/App.tsx", "a\nb\nc\n", "a\nb!\nc\n");
    expect(d).toContain("a/src/App.tsx");
    expect(d).toContain("b/src/App.tsx");
    expect(d).toContain("+b!");
    expect(d).toContain("-b");
  });
});