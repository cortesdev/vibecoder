import { describe, expect, it } from "vitest";
import { TEMPLATES, TEMPLATE_IDS, filesFor, resolveTemplate, type TemplateId } from "./catalog";
import { THEME_START, THEME_END } from "./shared";

const REQUIRED = [
  "index.html",
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
];

describe("template catalog", () => {
  it("ships exactly the six specified templates with metadata", () => {
    expect([...TEMPLATE_IDS].sort()).toEqual(
      ["blog", "chat-app", "ecommerce-lite", "landing", "portfolio", "saas-dashboard"].sort(),
    );
    for (const t of TEMPLATES) {
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
      expect(t.thumbnailUrl.trim().length).toBeGreaterThan(0);
    }
  });

  it("builds a complete runnable file set for every template", () => {
    for (const id of TEMPLATE_IDS) {
      const files = filesFor(id, "Acme");
      for (const f of REQUIRED) expect(files[f], `${id} misses ${f}`).toBeDefined();
      const pkg = JSON.parse(files["package.json"]) as { dependencies?: Record<string, string> };
      expect(pkg.dependencies?.react, `${id} react version`).toContain("19.2.8");
      expect(pkg.dependencies?.["react-dom"], `${id} react-dom version`).toContain("19.2.8");
      expect(files["index.html"]).toContain("/src/main.tsx");
      expect(files["index.html"]).toContain("Acme");
      expect(files["src/main.tsx"]).toContain("./App");
      expect(files["src/index.css"]).toContain(THEME_START);
      expect(files["src/index.css"]).toContain(THEME_END);
      // Generated sources must survive unescaped template-literal embedding.
      for (const [path, content] of Object.entries(files)) {
        expect(content.includes("`"), `${id}:${path} contains a backtick`).toBe(false);
      }
    }
  });

  it("gives every template a distinct App shell", () => {
    const apps = TEMPLATE_IDS.map((id) => filesFor(id, "Acme")["src/App.tsx"]);
    expect(new Set(apps).size).toBe(apps.length);
  });

  it("falls back to landing on unknown ids", () => {
    expect(resolveTemplate("nope" as TemplateId).id).toBe("landing");
    expect(resolveTemplate(undefined).id).toBe("landing");
  });

  it("escapes the project name for HTML and JS contexts", () => {
    const files = filesFor("landing", '<Evil> & "Co"');
    expect(files["index.html"]).toContain("&lt;Evil&gt; &amp;");
    expect(files["index.html"]).not.toContain("<Evil>");
  });
});
