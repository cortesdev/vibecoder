import { baseFiles, indexCss, jsString, type ThemeVars } from "./shared";

export const BLOG_THEME: ThemeVars = {
  bg: "#ffffff",
  surface: "#f6f4ef",
  ink: "#23201a",
  accent: "#0f766e",
  radius: 10,
  font: "Georgia, 'Times New Roman', serif",
};

const POSTS_TS =
  "export interface Post {\n" +
  "  slug: string;\n" +
  "  title: string;\n" +
  "  date: string;\n" +
  "  body: string[];\n" +
  "}\n" +
  "\n" +
  "export const POSTS: Post[] = [\n" +
  "  {\n" +
  '    slug: "hello-world",\n' +
  '    title: "Hello, world",\n' +
  '    date: "2026-09-01",\n' +
  "    body: [\n" +
  '      "This starter blog renders from a typed post list, so adding a post is one object.",\n' +
  '      "Posts support search from the index page and full reading views.",\n' +
  "    ],\n" +
  "  },\n" +
  "  {\n" +
  '    slug: "shipping-notes",\n' +
  '    title: "Notes on shipping",\n' +
  '    date: "2026-09-14",\n' +
  "    body: [\n" +
  '      "Small slices beat big launches. Each slice previews, exports, and builds.",\n' +
  "    ],\n" +
  "  },\n" +
  "];\n";

function appTsx(name: string): string {
  const brand = jsString(name.trim() || "My App");
  return (
    'import { useState } from "react";\n' +
    'import { POSTS } from "./posts";\n' +
    "\n" +
    "export default function App() {\n" +
    '  const [slug, setSlug] = useState<string | null>(null);\n' +
    '  const [query, setQuery] = useState("");\n' +
    "  const post = POSTS.find((p) => p.slug === slug) ?? null;\n" +
    "  const listed = POSTS.filter((p) => (p.title + p.body.join(\" \")).toLowerCase().includes(query.toLowerCase()));\n" +
    "  return (\n" +
    "    <main>\n" +
    "      <h1>" + brand + " notes</h1>\n" +
    "      {post ? (\n" +
    "        <article>\n" +
    '          <button type="button" className="secondary" onClick={() => setSlug(null)}>← All posts</button>\n' +
    "          <h2>{post.title}</h2>\n" +
    '          <p><time>{post.date}</time></p>\n' +
    "          {post.body.map((para, i) => (\n" +
    "            <p key={i}>{para}</p>\n" +
    "          ))}\n" +
    "        </article>\n" +
    "      ) : (\n" +
    "        <section>\n" +
    '          <label htmlFor="search">Search posts</label>\n' +
    '          <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try shipping…" style={{ marginLeft: 8 }} />\n' +
    "          {listed.map((p) => (\n" +
    '            <article key={p.slug} className="card" style={{ marginTop: 12 }}>\n' +
    "              <h2>{p.title}</h2>\n" +
    '              <p><time>{p.date}</time></p>\n' +
    '              <button type="button" onClick={() => setSlug(p.slug)}>Read</button>\n' +
    "            </article>\n" +
    "          ))}\n" +
    "          {listed.length === 0 && <p>No posts match.</p>}\n" +
    "        </section>\n" +
    "      )}\n" +
    "    </main>\n" +
    "  );\n" +
    "}\n"
  );
}

export function files(name: string): Record<string, string> {
  const base = baseFiles(name, appTsx(name), indexCss(BLOG_THEME));
  base["src/posts.ts"] = POSTS_TS;
  return base;
}
