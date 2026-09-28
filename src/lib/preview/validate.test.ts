import { describe, expect, it } from "vitest";
import { validateProject } from "./validate";
import { filesFor } from "@/lib/templates/catalog";

describe("validateProject", () => {
  it("passes a working template", async () => {
    const result = await validateProject(filesFor("landing", "Acme"));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails readably on a broken import", async () => {
    const files = filesFor("landing", "Acme");
    const result = await validateProject({ ...files, "src/App.tsx": 'import Missing from "./missing";\nexport default Missing;\n' });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /missing|Could not resolve/i.test(e.message))).toBe(true);
  });

  it("extracts file paths for the editor", async () => {
    const files = filesFor("landing", "Acme");
    const result = await validateProject({ ...files, "src/App.tsx": 'import Missing from "./missing";\nexport default Missing;\n' });
    expect(result.errors.some((e) => e.path === "src/App.tsx")).toBe(true);
  });
});
