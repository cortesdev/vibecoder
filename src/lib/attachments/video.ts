// Bounded video-frame extraction. Only the first five seconds are sampled,
// at most maxFrames stills, each downscaled to maxSide, inside an overall
// time budget. Raw MP4/WebM is NEVER sent as image_url. The actual frame
// grabber is injected (VideoRunner) so tests are deterministic and the route
// can pick whatever runs in its environment; when nothing can run, extraction
// fails with an actionable error — never a text-only guess dressed as vision.

export const VIDEO_LIMITS = {
  windowMs: 5_000,
  maxFrames: 4,
  maxSide: 768,
  timeBudgetMs: 20_000,
} as const;

export interface RawFrame {
  timestampMs: number;
  imageUrl: string;
}

export type RunnerResult =
  | { ok: true; frames: RawFrame[]; stoppedBy: "window" | "frame-cap" | "budget" }
  | { ok: false; reason: string };

export type VideoRunner = (input: {
  bytes: Uint8Array;
  mimeType: string;
  timestamps: number[];
  maxSide: number;
  timeBudgetMs: number;
}) => Promise<RunnerResult>;

/** Evenly spaced sample timestamps inside the window (ms). */
export function planFrameTimestamps(durationMs: number): number[] {
  const span = Math.min(Math.max(durationMs, 0), VIDEO_LIMITS.windowMs);
  if (span <= 0) return [0];
  const step = span / VIDEO_LIMITS.maxFrames;
  const out = new Set<number>();
  for (let i = 0; i < VIDEO_LIMITS.maxFrames; i++) {
    out.add(Math.min(Math.round(i * step), VIDEO_LIMITS.windowMs));
  }
  return [...out].sort((a, b) => a - b);
}

export type VideoExtraction =
  | {
      ok: true;
      frames: { timestampMs: number; imageUrl: string; detail: "low" }[];
      stoppedBy: "window" | "frame-cap" | "budget";
    }
  | { ok: false; code: 415; fileName: string; message: string };

export async function extractVideoFrames(
  input: { name: string; mimeType: string; bytes: Uint8Array; durationMs?: number },
  run: VideoRunner,
): Promise<VideoExtraction> {
  const timestamps = planFrameTimestamps(input.durationMs ?? VIDEO_LIMITS.windowMs);
  const result = await run({
    bytes: input.bytes,
    mimeType: input.mimeType,
    timestamps,
    maxSide: VIDEO_LIMITS.maxSide,
    timeBudgetMs: VIDEO_LIMITS.timeBudgetMs,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: 415,
      fileName: input.name,
      message: `This server cannot process video (${result.reason}). Attach a screenshot or image instead — the request was not sent as visual analysis.`,
    };
  }
  for (const f of result.frames) {
    if (!f.imageUrl.startsWith("data:image/")) {
      return {
        ok: false,
        code: 415,
        fileName: input.name,
        message: "Extractor returned non-image data; raw video is never forwarded.",
      };
    }
  }
  return {
    ok: true,
    frames: result.frames.map((f) => ({ ...f, detail: "low" as const })),
    stoppedBy: result.stoppedBy,
  };
}

/** Default runner: no frame grabber ships in this runtime. The route replaces
 *  it where an extractor (e.g. ffmpeg) is available and bounded. */
export const unsupportedRunner: VideoRunner = async () => ({ ok: false, reason: "no-binary" });
