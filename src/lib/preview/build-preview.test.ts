import { describe, expect, it } from "vitest";
import {
  assembleHtml,
  escapeHtml,
  findEntry,
  formatBuildError,
  loaderFor,
  norm,
} from "./build-preview";

describe("preview document assembly", () => {
  it("finds the module entry or falls back to the Vite convention", () => {
    expect(findEntry({ "index.html": '<script type="module" src="/src/app.tsx"></script>' })).toBe("src/app.tsx");
    expect(findEntry({})).toBe("src/main.tsx");
  });

  it("normalizes vault paths", () => {
    expect(norm("/src/App.tsx")).toBe("src/App.tsx");
    expect(norm("./src/App.tsx")).toBe("src/App.tsx");
    expect(norm("src/App.tsx")).toBe("src/App.tsx");
  });

  it("maps extensions to esbuild loaders", () => {
    expect(loaderFor("a.tsx")).toBe("tsx");
    expect(loaderFor("a.css")).toBe("css");
    expect(loaderFor("a.json")).toBe("json");
    expect(loaderFor("a.weird")).toBe("ts");
  });

  it("escapes HTML metacharacters", () => {
    expect(escapeHtml('<a href="x">&')).toBe("&lt;a href=\"x\"&gt;&amp;");
  });

  it("injects the bundle and marks the document complete", () => {
    const doc = assembleHtml(
      { "index.html": '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' },
      "console.log(1)",
    );
    expect(doc).toContain("vibecoder-bundled");
    expect(doc).toContain("console.log(1)");
    expect(doc).not.toContain('type="module" src=');
  });

  it("leaves a document without an injectable body untouched", () => {
    const bare = "<!doctype html><html><head></head></html>";
    expect(assembleHtml({ "index.html": bare }, "x")).toContain("Content-Security-Policy");
  });

  it("applies a restrictive CSP and keeps React CDN reachable", () => {
    const doc = assembleHtml(
      { "index.html": "<!doctype html><html><head></head><body></body></html>" },
      "x",
    );
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("script-src 'unsafe-inline' https:");
    expect(doc).toContain("frame-ancestors 'none'");
  });

  it("summarizes build failures readably", () => {
    expect(formatBuildError(new Error("a\nb"))).toBe("a\nb");
    expect(formatBuildError("weird")).toBe("Preview build failed.");
  });
});
