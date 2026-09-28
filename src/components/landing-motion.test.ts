// Landing-motion behavior contracts that hold without a DOM. (Component
// rendering is covered by the jsdom suite alongside video-intro.test.ts;
// jsdom itself is currently broken repo-wide — see video-intro run — so this
// file stays on the default node environment and must keep passing.)

import { describe, expect, it } from "vitest";

// Copy lives with the callers; this file only checks behavior contracts.
import { pageProgress, prefersReduced } from "./landing-motion";

describe("pageProgress", () => {
  it("maps scroll position to 0..1", () => {
    expect(pageProgress(0, 2000, 1000)).toBe(0);
    expect(pageProgress(500, 2000, 1000)).toBe(0.5);
    expect(pageProgress(1000, 2000, 1000)).toBe(1);
  });

  it("clamps overscroll in both directions", () => {
    expect(pageProgress(-50, 2000, 1000)).toBe(0);
    expect(pageProgress(5000, 2000, 1000)).toBe(1);
  });

  it("returns 0 when there is nothing to scroll", () => {
    expect(pageProgress(0, 800, 1000)).toBe(0);
    expect(pageProgress(0, 1000, 1000)).toBe(0);
  });

  it("returns 0 for non-finite input", () => {
    expect(pageProgress(0, Number.NaN, 1000)).toBe(0);
  });
});

describe("prefersReduced", () => {
  it("is false without a window (SSR / node)", () => {
    expect(prefersReduced()).toBe(false);
  });
});
