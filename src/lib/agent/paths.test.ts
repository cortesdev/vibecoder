import { describe, expect, it } from "vitest";
import { isValidProjectPath, sanitizePath } from "./paths";

describe("isValidProjectPath", () => {
  it("accepts relative repo paths", () => {
    expect(isValidProjectPath("src/App.tsx")).toBe(true);
    expect(isValidProjectPath("a/b/c.txt")).toBe(true);
    expect(isValidProjectPath("index.html")).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(isValidProjectPath("/etc/passwd")).toBe(false);
    expect(isValidProjectPath("/src/App.tsx")).toBe(false);
  });

  it("rejects traversal", () => {
    expect(isValidProjectPath("../secret")).toBe(false);
    expect(isValidProjectPath("a/../b")).toBe(false);
    expect(isValidProjectPath("a/./b")).toBe(false);
  });

  it("rejects empty and malformed segments", () => {
    expect(isValidProjectPath("")).toBe(false);
    expect(isValidProjectPath("a//b")).toBe(false);
    expect(isValidProjectPath("a\\..\\b")).toBe(false);
    expect(isValidProjectPath("a/")).toBe(false);
  });
});

describe("sanitizePath", () => {
  it("normalizes backslashes and duplicate slashes", () => {
    expect(sanitizePath("src\\foo.ts")).toBe("src/foo.ts");
    expect(sanitizePath("src//foo.ts")).toBe("src/foo.ts");
  });
});