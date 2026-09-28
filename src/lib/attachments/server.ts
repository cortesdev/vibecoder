import type { AgentAttachment } from "@/lib/agent/types";

// Server-side attachment validation. Inspects actual bytes — never trusts
// extensions or browser MIME. The server is authoritative; the client also
// validates for fast feedback, but rejected content never reaches the model.

export const ATTACHMENT_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024, // 8 MiB post-upload cap per file
  maxFiles: 6, // bounded attachment count per request
  maxTotalBytes: 20 * 1024 * 1024, // bounded total request size
  maxTextChars: 60_000, // text extraction limit per document
} as const;

export interface AttachmentInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type AttachmentRejection = {
  ok: false;
  code: 413 | 415;
  fileName: string;
  limitBytes?: number;
  message: string;
};

export type AttachmentAccepted = {
  ok: true;
  detected: string;
  attachment: AgentAttachment;
};

function reject(code: 413 | 415, fileName: string, message: string, limitBytes?: number): AttachmentRejection {
  return { ok: false, code, fileName, message, ...(limitBytes === undefined ? {} : { limitBytes }) };
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

function detectKind(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.slice(8, 12), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (bytes.length >= 12 && startsWith(bytes.slice(4, 8), [0x66, 0x74, 0x79, 0x70])) return "video/mp4";
  return null;
}

function isProbablyText(bytes: Uint8Array): boolean {
  // No NULs and no PE/ELF/Mach-O/Zip signatures in the head sample.
  if (bytes.includes(0)) return false;
  if (startsWith(bytes, [0x4d, 0x5a])) return false;
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return false;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  return true;
}

const ACTIVE_SVG = /<(script|foreignObject)\b|on\w+\s*=|href\s*=\s*["']?\s*javascript:/i;

function decodeUtf8(bytes: Uint8Array, fileName: string): string | AttachmentRejection {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject(415, fileName, "File is not valid UTF-8 text.");
  }
}

/** Validate one upload's bytes. Images become data-URL attachments here so
 *  the agent layer never handles raw upload bytes. */
export function validateAttachmentBytes(input: AttachmentInput): AttachmentAccepted | AttachmentRejection {
  const { name, bytes } = input;
  if (bytes.length > ATTACHMENT_LIMITS.maxFileBytes) {
    return reject(413, name, `File exceeds the 8 MB per file limit (${bytes.length} bytes).`, ATTACHMENT_LIMITS.maxFileBytes);
  }
  if (bytes.length === 0) return reject(415, name, "File is empty.");

  const magic = detectKind(bytes);
  if (magic === "image/png" || magic === "image/jpeg" || magic === "image/webp") {
    return {
      ok: true,
      detected: magic,
      attachment: {
        kind: "image",
        name,
        mimeType: magic,
        imageUrl: `data:${magic};base64,${Buffer.from(bytes).toString("base64")}`,
        detail: "auto",
      },
    };
  }
  if (magic === "image/gif") {
    // Documented first-frame representation: providers consume the GIF with
    // first-frame semantics; the original filename is preserved in metadata.
    return {
      ok: true,
      detected: magic,
      attachment: {
        kind: "image",
        name,
        mimeType: magic,
        imageUrl: `data:${magic};base64,${Buffer.from(bytes).toString("base64")}`,
        detail: "auto",
      },
    };
  }
  if (magic === "application/pdf") {
    // No server PDF text engine in this runtime: accept the container so the
    // agent can name it, with extraction marked unavailable downstream.
    return {
      ok: true,
      detected: magic,
      attachment: { kind: "document", name, mimeType: magic, extractedText: "", truncated: true },
    };
  }
  if (magic === "video/mp4" || magic === "video/webm") {
    // Video is never sent as image_url — frames are extracted in video.ts.
    return {
      ok: true,
      detected: magic,
      attachment: { kind: "videoFrames", name, mimeType: magic, frames: [] },
    };
  }

  // SVG + text family: sniff content, never trust the declared type.
  const text = decodeUtf8(bytes, name);
  if (typeof text !== "string") return text;
  const head = text.slice(0, 2048).trimStart();
  const looksSvg = head.startsWith("<svg") || head.startsWith("<?xml");
  if (looksSvg) {
    if (ACTIVE_SVG.test(text)) return reject(415, name, "SVG contains active content (script, event handlers, or javascript: URLs).");
    return {
      ok: true,
      detected: "image/svg+xml",
      attachment: {
        kind: "image",
        name,
        mimeType: "image/svg+xml",
        imageUrl: `data:image/svg+xml;base64,${Buffer.from(bytes).toString("base64")}`,
        detail: "auto",
      },
    };
  }

  const lower = name.toLowerCase();
  const textLike =
    lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown") ||
    lower.endsWith(".json") || lower.endsWith(".csv") || input.mimeType.startsWith("text/");
  if (!textLike || !isProbablyText(bytes)) {
    return reject(415, name, `Unsupported content: ${magic ?? "unrecognized bytes"}. Send PNG, JPEG, WebP, GIF, SVG, MP4, WebM, PDF, TXT, MD, JSON, or CSV.`);
  }
  if (lower.endsWith(".json")) {
    try {
      JSON.parse(text);
    } catch {
      return reject(415, name, "File is not valid JSON.");
    }
  }
  const truncated = text.length > ATTACHMENT_LIMITS.maxTextChars;
  return {
    ok: true,
    detected: lower.endsWith(".json") ? "application/json" : "text/plain",
    attachment: {
      kind: "document",
      name,
      mimeType: lower.endsWith(".json") ? "application/json" : "text/plain",
      extractedText: truncated ? text.slice(0, ATTACHMENT_LIMITS.maxTextChars) : text,
      truncated,
    },
  };
}

/** Request-level bounds: count and total size. Returns rejections per file. */
export function checkRequestBounds(files: { name: string; size: number }[]): AttachmentRejection | null {
  if (files.length > ATTACHMENT_LIMITS.maxFiles) {
    return reject(413, files[ATTACHMENT_LIMITS.maxFiles]?.name ?? "", `Too many attachments (max ${ATTACHMENT_LIMITS.maxFiles}).`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > ATTACHMENT_LIMITS.maxTotalBytes) {
    return reject(413, "", "Attachments exceed the total request size.", ATTACHMENT_LIMITS.maxTotalBytes);
  }
  return null;
}
