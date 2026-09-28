import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { buildExportZip, exportFilename, normalizeExportPath } from "./export";
import { filesFor } from "@/lib/templates/catalog";

describe("export path safety", () => {
  it("normalizes POSIX relatives", () => {
    expect(normalizeExportPath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeExportPath("a//b/./c.ts")).toBe("a/b/c.ts");
  });

  it.each(["../secret", "a/../../x", "/absolute", "C:\\win", "C:/win", "", ".", "a/\0b"])(
    "rejects %p",
    (p) => {
      expect(() => normalizeExportPath(p)).toThrow();
    },
  );

  it("rejects duplicate normalized names", () => {
    expect(() => buildExportZip({ "a/b.ts": "1", "a//b.ts": "2" })).toThrow(/duplicate/i);
  });
});

describe("export zip contents", () => {
  it("round-trips a template byte-for-byte", () => {
    const files = filesFor("blog", "Acme");
    const zip = buildExportZip(files);
    const out = unzipSync(zip);
    for (const [path, content] of Object.entries(files)) {
      const bytes = out[path];
      expect(bytes, path).toBeDefined();
      expect(Buffer.from(bytes).toString("utf8")).toBe(content);
    }
  });

  it("excludes secrets and keeps no symlink entries", () => {
    const zip = buildExportZip({
      "src/App.tsx": "x",
      ".env": "SECRET=1",
      "certs/key.pem": "k",
    });
    const names = Object.keys(unzipSync(zip));
    expect(names).toEqual(["src/App.tsx"]);
  });

  it("caps total size", () => {
    expect(() => buildExportZip({ "big.bin": "x".repeat(21_000_000) })).toThrow(/too large/i);
  });
});

describe("export filename", () => {
  it("sanitizes hostile project names", () => {
    expect(exportFilename('<Evil>/"Co"')).toBe("evil-co.zip");
    expect(exportFilename("  ")).toBe("project.zip");
  });
});
