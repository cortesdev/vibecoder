// Client-side attachment prep. Fast precheck before reading anything; raster
// downscale so uploads stay small without becoming unreadable. The server
// re-validates everything — this layer is feedback, not security.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 2048;

export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
];

const EXT_FALLBACK: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
};

export interface ClientFile {
  name: string;
  type: string;
  size: number;
}

/** Declared type for a file, falling back to the extension when the browser
 *  reports nothing (some platforms leave File.type empty). */
export function declaredType(file: ClientFile): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_FALLBACK[ext] ?? "";
}

export type Precheck = { ok: true; type: string } | { ok: false; message: string };

/** Validate declared type + byte limit before reading. Never reads content. */
export function precheckFile(file: ClientFile): Precheck {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: `${file.name}: exceeds the 8 MB per file limit.` };
  }
  const type = declaredType(file);
  if (!ACCEPTED_TYPES.includes(type)) {
    return { ok: false, message: `${file.name}: unsupported type. Send images, short video, PDF, or text.` };
  }
  return { ok: true, type };
}

export interface Downscaled {
  blob: Blob;
  width: number;
  height: number;
  downscaled: boolean;
}

/** Downscale raster images whose longest side exceeds 2048px, keeping aspect
 *  ratio. Imaging APIs only exist in browsers — outside one this throws a
 *  clear error instead of silently shipping the original. */
export async function downscaleImage(blob: Blob): Promise<Downscaled> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    throw new Error("Image downscaling needs a browser context.");
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_SIDE) return { blob, width: bitmap.width, height: bitmap.height, downscaled: false };
    const scale = MAX_IMAGE_SIDE / longest;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob, width: bitmap.width, height: bitmap.height, downscaled: false };
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return { blob: out ?? blob, width, height, downscaled: out !== null };
  } finally {
    bitmap.close();
  }
}
