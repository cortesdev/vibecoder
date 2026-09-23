// Keeps node_modules/esbuild-wasm/esbuild.wasm in sync with public/esbuild so
// the browser-based project preview can load it from a local URL (fast, offline).
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../node_modules/esbuild-wasm/esbuild.wasm", import.meta.url));
const dir = fileURLToPath(new URL("../public/esbuild", import.meta.url));
mkdirSync(dir, { recursive: true });
copyFileSync(from, `${dir}/esbuild.wasm`);
console.log("copied esbuild.wasm → public/esbuild/esbuild.wasm");