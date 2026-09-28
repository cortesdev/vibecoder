import { describe, expect, it } from "vitest";
import { TEMPLATES, filesFor } from "./catalog";
import { buildPreviewSnapshot, type EsbuildLike } from "@/lib/preview/build-preview";

// Parameterized build gate: every template bundles with zero prompts through
// the same pure pipeline the browser preview uses. esbuild-wasm initializes
// from its bundled binary in Node — no network involved.
let cached: Promise<EsbuildLike> | null = null;
async function esbuild(): Promise<EsbuildLike> {
  cached ??= (async () => {
    const m = (await import("esbuild-wasm")) as unknown as {
      initialize: () => Promise<void>;
      build: EsbuildLike["build"];
    };
    await m.initialize();
    return m;
  })();
  return cached;
}

describe("template builds", () => {
  it.each(TEMPLATES.map((t) => [t.id] as [string]))("%s bundles to a complete document", async (id) => {
    const doc = await buildPreviewSnapshot(await esbuild(), filesFor(id, "Acme"));
    expect(doc).toContain("vibecoder-bundled");
    expect(doc).toContain("Acme");
    expect(doc).not.toContain('type="module" src=');
  }, 120_000);
});
