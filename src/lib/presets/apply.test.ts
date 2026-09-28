import { describe, expect, it } from "vitest";
import { applyPresetCss } from "./apply";
import { getPreset } from "@/lib/presets";
import { THEME_START, THEME_END } from "@/lib/templates/shared";

const CSS = [
  THEME_START,
  ":root {",
  "  --bg: #000;",
  "  --surface: #111;",
  "  --ink: #eee;",
  "  --accent: #00f;",
  "  --radius: 8px;",
  "  --font: serif;",
  "}",
  THEME_END,
  "h1 { color: var(--accent); }",
  ".custom { margin: 3px; }",
].join("\n");

describe("applyPresetCss", () => {
  it("rewrites only the theme section, byte-for-byte elsewhere", () => {
    const { nextCss, previousCss } = applyPresetCss(CSS, "coral");
    expect(previousCss).toBe(CSS);
    expect(nextCss).toContain("--accent: #ff5c39;");
    expect(nextCss).toContain(".custom { margin: 3px; }");
    expect(nextCss).toContain("h1 { color: var(--accent); }");
    expect(nextCss).not.toContain("--bg: #000;");
    // Everything outside the delimiters is untouched.
    const strip = (s: string) => s.replace(/\/\* vibecoder:theme:(start|end) \*\/[\s\S]*?\/\* vibecoder:theme:(start|end) \*\//, "X");
    expect(strip(nextCss).replace("X", "")).toBe(strip(CSS).replace("X", ""));
  });

  it("round-trips: applying twice then undoing restores bytes", () => {
    const first = applyPresetCss(CSS, "coral");
    const second = applyPresetCss(first.nextCss, "terminal");
    expect(second.previousCss).toBe(first.nextCss);
    expect(applyPresetCss(second.nextCss, "midnight").previousCss).not.toBe(CSS);
  });

  it("rejects missing delimiters readably", () => {
    expect(() => applyPresetCss("h1 { color: red; }", "coral")).toThrow(/theme section|delimiter/i);
  });

  it("rejects malformed (unclosed) delimiters readably", () => {
    expect(() => applyPresetCss(`${THEME_START}\n:root{}`, "coral")).toThrow(/delimiter/i);
  });

  it("rejects unknown presets", () => {
    expect(() => applyPresetCss(CSS, "nope")).toThrow(/unknown preset/i);
  });

  it("every preset produces a distinct theme section", () => {
    const sections = new Set(
      ["midnight", "aura", "terminal", "ocean", "paper", "coral", "sage", "lavender"].map(
        (slug) => applyPresetCss(CSS, slug).nextCss,
      ),
    );
    expect(sections.size).toBe(8);
    expect(getPreset("nope").slug).toBe("midnight");
  });
});
