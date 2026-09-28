import { describe, expect, it } from "vitest";
import { ACCEPTED_TYPES, MAX_IMAGE_SIDE, precheckFile, type ClientFile } from "./client";

function f(name: string, type: string, size: number): ClientFile {
  return { name, type, size };
}

describe("client precheck", () => {
  it("accepts declared images, video, and documents under the cap", () => {
    for (const t of ACCEPTED_TYPES) {
      const r = precheckFile(f("a", t, 100));
      expect(r.ok, t).toBe(true);
    }
  });

  it("rejects over-limit files before reading a byte", () => {
    const r = precheckFile(f("big.png", "image/png", 8 * 1024 * 1024 + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("8 MB per file");
  });

  it("rejects undeclared kinds (zip) immediately", () => {
    const r = precheckFile(f("a.zip", "application/zip", 10));
    expect(r.ok).toBe(false);
  });

  it("exposes the downscale target for oversized rasters", () => {
    expect(MAX_IMAGE_SIDE).toBe(2048);
  });
});
