import { writeFileSync, mkdirSync } from "node:fs";
import { filesFor } from "@/lib/templates/catalog";
import { buildExportZip } from "@/lib/projects/export";
import { unzipSync } from "fflate";

const dir = "/tmp/zipcheck-blog";
mkdirSync(dir, { recursive: true });
const zip = buildExportZip(filesFor("blog", "Acme"));
const out = unzipSync(zip);
for (const [path, bytes] of Object.entries(out)) {
  const full = `${dir}/${path}`;
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, bytes);
}
console.log(`extracted ${Object.keys(out).length} files to ${dir}`);
