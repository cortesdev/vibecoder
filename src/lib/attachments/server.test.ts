import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LIMITS,
  validateAttachmentBytes,
  type AttachmentInput,
} from "./server";

function file(name: string, mimeType: string, bytes: Uint8Array): AttachmentInput {
  return { name, mimeType, bytes };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);

describe("server attachment validation", () => {
  it("accepts PNG/JPEG by magic bytes and reports image dimensions path", () => {
    const r = validateAttachmentBytes(file("shot.png", "image/png", PNG));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detected).toBe("image/png");
  });

  it("rejects extension/MIME spoofing (bytes decide)", () => {
    const r = validateAttachmentBytes(file("evil.png", "image/png", new Uint8Array([0x4d, 0x5a, 0x90, 0x00])));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(415);
  });

  it("rejects executables masquerading as documents", () => {
    const r = validateAttachmentBytes(file("notes.txt", "text/plain", new Uint8Array([0x4d, 0x5a, 0x90, 0x00])));
    expect(r.ok).toBe(false);
  });

  it("enforces the 8 MiB post-upload cap with 413", () => {
    const big = new Uint8Array(ATTACHMENT_LIMITS.maxFileBytes + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = validateAttachmentBytes(file("huge.png", "image/png", big));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(413);
      expect(r.message).toContain("8 MB per file");
    }
  });

  it("rejects SVG with active content", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = validateAttachmentBytes(file("pic.svg", "image/svg+xml", svg));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(415);
  });

  it("accepts inert SVG", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
    const r = validateAttachmentBytes(file("pic.svg", "image/svg+xml", svg));
    expect(r.ok).toBe(true);
  });

  it("extracts bounded text with truncation flagged", () => {
    const text = "hello world";
    const r = validateAttachmentBytes(file("a.txt", "text/plain", new TextEncoder().encode(text)));
    expect(r.ok).toBe(true);
    if (r.ok && r.attachment.kind === "document") {
      expect(r.attachment.extractedText).toBe(text);
      expect(r.attachment.truncated).toBe(false);
    } else {
      throw new Error("expected document");
    }
  });

  it("rejects invalid JSON explicitly and invalid UTF-8", () => {
    const bad = validateAttachmentBytes(file("a.json", "application/json", new TextEncoder().encode("{oops")));
    expect(bad.ok).toBe(false);
    const latin1 = new Uint8Array([0xff, 0xfe, 0x41]);
    const badText = validateAttachmentBytes(file("a.txt", "text/plain", latin1));
    expect(badText.ok).toBe(false);
  });

  it("accepts PDF by magic bytes for text extraction downstream", () => {
    const r = validateAttachmentBytes(file("doc.pdf", "application/pdf", PDF));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detected).toBe("application/pdf");
  });

  it("rejects unsupported kinds (zip) with 415", () => {
    const r = validateAttachmentBytes(file("a.zip", "application/zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04])));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(415);
  });
});
