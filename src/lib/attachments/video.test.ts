import { describe, expect, it } from "vitest";
import { VIDEO_LIMITS, extractVideoFrames, planFrameTimestamps, type VideoRunner } from "./video";

const okRunner: VideoRunner = async () => ({
  ok: true,
  frames: [
    { timestampMs: 0, imageUrl: "data:image/jpeg;base64,AAA" },
    { timestampMs: 2500, imageUrl: "data:image/jpeg;base64,BBB" },
  ],
  stoppedBy: "frame-cap",
});

describe("video frame planning", () => {
  it("samples within the first five seconds at a bounded rate", () => {
    const ts = planFrameTimestamps(30_000);
    expect(ts.length).toBeLessThanOrEqual(VIDEO_LIMITS.maxFrames);
    expect(Math.max(...ts)).toBeLessThanOrEqual(VIDEO_LIMITS.windowMs);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });

  it("samples short clips within their own duration", () => {
    const ts = planFrameTimestamps(1000);
    expect(ts.length).toBeLessThanOrEqual(VIDEO_LIMITS.maxFrames);
    expect(ts[0]).toBe(0);
    expect(Math.max(...ts)).toBeLessThanOrEqual(1000);
  });
});

describe("video extraction", () => {
  it("returns timestamped low-detail frames and names the limiting bound", async () => {
    const r = await extractVideoFrames({ name: "clip.mp4", mimeType: "video/mp4", bytes: new Uint8Array(10) }, okRunner);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frames).toHaveLength(2);
      expect(r.frames[0]).toMatchObject({ timestampMs: 0, detail: "low" });
      expect(r.stoppedBy).toBe("frame-cap");
    }
  });

  it("fails actionable when no extractor runs here", async () => {
    const r = await extractVideoFrames(
      { name: "clip.mp4", mimeType: "video/mp4", bytes: new Uint8Array(10) },
      async () => ({ ok: false, reason: "no-binary" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(415);
      expect(r.message).toContain("cannot process video");
    }
  });

  it("never forwards raw video as image input", async () => {
    const r = await extractVideoFrames({ name: "c.webm", mimeType: "video/webm", bytes: new Uint8Array(10) }, okRunner);
    if (r.ok) {
      for (const f of r.frames) expect(f.imageUrl.startsWith("data:image/")).toBe(true);
    } else {
      throw new Error("expected frames");
    }
  });
});
