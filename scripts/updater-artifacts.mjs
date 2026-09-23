#!/usr/bin/env node
/**
 * Release asset tooling for the desktop updater.
 *
 * `tauri build` emits version-stamped, platform-specific filenames. The update
 * feed in this repo (src/lib/updates.ts) serves *canonical* names, and the
 * download buttons link to versionless names so `releases/latest/download/…`
 * keeps working. This script bridges the two:
 *
 *   collect  run in each build job — find the bundles a runner produced, copy
 *            them out under canonical names (with their .sig next to them),
 *            and write a fragment.json describing what that runner covered.
 *   merge    run once after all builds — union the fragments into latest.json,
 *            the Tauri static manifest (a bonus alongside our own endpoint).
 *
 * Both commands are pure file operations; the decisions they make live in
 * classify() / mergeFragments() so tests/updater-artifacts.test.ts can check
 * them against the feed's expectations without a Rust toolchain.
 *
 * Usage:
 *   node scripts/updater-artifacts.mjs collect --search src-tauri/target --out dist-update --version 1.1.0
 *   node scripts/updater-artifacts.mjs merge --fragments release-assets --out release-assets \
 *     --version 1.1.0 --base-url https://github.com/o/r/releases/download/v1.1.0 --notes-file NOTES.md
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// The contract. These canonical names are what the live feed serves; the
// cross-check test asserts they match assetForPlatform() in src/lib/updates.ts.
// ---------------------------------------------------------------------------

/** Updater bundles the desktop app downloads and verifies (platform → name). */
export const UPDATER_ASSETS = {
  "darwin-aarch64": "Vibecoder_aarch64.app.tar.gz",
  "darwin-x86_64": "Vibecoder_x64.app.tar.gz",
  "windows-x86_64": "Vibecoder_x64-setup.zip",
  "linux-x86_64": "Vibecoder_amd64.AppImage.tar.gz",
};

/** Human downloads behind the site's download buttons. Versionless on
 *  purpose: `releases/latest/download/<name>` only resolves if the name is the
 *  same in every release. */
export const INSTALLER_ASSETS = {
  "darwin-aarch64": "Vibecoder-arm64-mac.dmg",
  "darwin-x86_64": "Vibecoder-x64-mac.dmg",
  "windows-x86_64": "Vibecoder-x64-win.exe",
  "linux-x86_64-deb": "Vibecoder-amd64.deb",
  "linux-x86_64-rpm": "Vibecoder-x86_64.rpm",
};

/** Rust target triple → the arch token used in Tauri's filenames. */
const TRIPLE_ARCH = {
  "aarch64-apple-darwin": "aarch64",
  "x86_64-apple-darwin": "x86_64",
  "x86_64-pc-windows-msvc": "x86_64",
  "i686-pc-windows-msvc": "i686",
  "x86_64-unknown-linux-gnu": "x86_64",
  "aarch64-unknown-linux-gnu": "aarch64",
};

function hostArch() {
  return process.arch === "arm64" ? "aarch64" : "x86_64";
}

/** Arch of the build that produced a file: the target triple in its path, the
 *  token in its filename, or the host as a last resort. */
function archOf(relPath, fileName) {
  const triple = relPath.match(/(aarch64|x86_64|i686)-[a-z0-9_]+-[a-z0-9_]+/);
  if (triple && TRIPLE_ARCH[triple[0]]) return TRIPLE_ARCH[triple[0]];
  if (/(^|_)aarch64(_|\.)/.test(fileName)) return "aarch64";
  if (/(^|_)x64(_|\.)|(^|_)x86_64(_|\.)/.test(fileName)) return "x86_64";
  if (/(^|_)amd64(_|\.)/.test(fileName)) return "x86_64";
  return hostArch();
}

/**
 * Map one file from a bundle directory to its canonical release asset.
 * Returns { name, platform, updater } or null when nothing claims it.
 *
 * Only the "v1Compatible" updater layout is accepted (see docs): a bare
 * .AppImage or -setup.exe cannot be renamed into a .tar.gz/.zip honestly, so
 * those are reported as a config problem instead of silently mangled.
 */
export function classify(relPath, fileName) {
  const p = relPath.split(path.sep).join("/");
  const arch = archOf(p, fileName);

  if (/\.app\.tar\.gz$/.test(fileName)) {
    const platform = `darwin-${arch}`;
    return UPDATER_ASSETS[platform] ? { name: UPDATER_ASSETS[platform], platform, updater: true } : null;
  }
  if (/-setup\.nsis\.zip$/.test(fileName)) {
    return { name: UPDATER_ASSETS["windows-x86_64"], platform: "windows-x86_64", updater: true };
  }
  if (/\.AppImage\.tar\.gz$/.test(fileName)) {
    return { name: UPDATER_ASSETS["linux-x86_64"], platform: "linux-x86_64", updater: true };
  }
  if (/\.dmg$/.test(fileName)) {
    const platform = `darwin-${arch}`;
    return INSTALLER_ASSETS[platform] ? { name: INSTALLER_ASSETS[platform], platform, updater: false } : null;
  }
  if (/-setup\.exe$/.test(fileName)) {
    return { name: INSTALLER_ASSETS["windows-x86_64"], platform: "windows-x86_64", updater: false };
  }
  if (/\.deb$/.test(fileName)) {
    return { name: INSTALLER_ASSETS["linux-x86_64-deb"], platform: "linux-x86_64", updater: false };
  }
  if (/\.rpm$/.test(fileName)) {
    return { name: INSTALLER_ASSETS["linux-x86_64-rpm"], platform: "linux-x86_64", updater: false };
  }
  return null;
}

/** A bundle that is in the v2 layout but not the v1Compatible one. */
export function looksLikeV2OnlyLayout(fileName) {
  return /\.AppImage$/.test(fileName) || /-setup\.exe$/.test(fileName) || /\.msi\.zip$/.test(fileName);
}

async function walk(dir, base = dir, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "debug" || entry.name === "deps" || entry.name === "incremental") continue;
      await walk(full, base, found);
    } else {
      found.push({ full, rel: path.relative(base, full), name: entry.name });
    }
  }
  return found;
}

/**
 * Union the per-runner entries (one per platform, read back from the
 * platform-<key>.json files) into the Tauri static manifest. `sigContent` is injected
 * by the caller (fs) so this stays pure, and a platform without a signature is
 * left out instead of being advertised as installable.
 */
export function mergeFragments(entries, { version, notes = "", pubDate = new Date().toISOString(), baseUrl, sigContent }) {
  const platforms = {};
  for (const entry of entries) {
    if (!entry?.platform || !UPDATER_ASSETS[entry.platform]) continue;
    const signature = sigContent[`${entry.asset}.sig`];
    if (!signature) continue;
    platforms[entry.platform] = { signature: signature.trim(), url: `${baseUrl}/${entry.asset}` };
  }
  return {
    version,
    notes: notes ?? "",
    pub_date: pubDate,
    platforms,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  }
  return args;
}

async function runCollect(args) {
  const searchRoots = String(args.search ?? "src-tauri/target").split(path.delimiter);
  const outDir = String(args.out ?? "dist-update");
  const files = [];
  for (const root of searchRoots) files.push(...(await walk(root)));

  await mkdir(outDir, { recursive: true });
  const platforms = {};
  const installers = [];
  const seen = new Set();
  const collisions = [];
  let skippedV2 = 0;

  for (const file of files) {
    if (/\.sig$/.test(file.name)) continue;
    const match = classify(file.rel, file.name);
    if (!match) {
      if (looksLikeV2OnlyLayout(file.name) && !/-setup\.exe$/.test(file.name)) skippedV2 += 1;
      continue;
    }
    if (seen.has(match.name)) continue;
    if (match.updater && platforms[match.platform]) {
      collisions.push(`${match.platform} (${file.rel})`);
      continue;
    }

    const sigSource = `${file.full}.sig`;
    let hasSig = true;
    try {
      await readFile(sigSource);
    } catch {
      hasSig = false;
    }
    // Updater bundles must be signed — an unsigned one can never be installed.
    if (match.updater && !hasSig) continue;

    await copyFile(file.full, path.join(outDir, match.name));
    if (hasSig) await copyFile(sigSource, path.join(outDir, `${match.name}.sig`));
    seen.add(match.name);
    if (match.updater) platforms[match.platform] = match.name;
    else installers.push(match.name);
  }

  if (skippedV2 > 0 && Object.keys(platforms).length === 0) {
    throw new Error(
      "Found v2-layout bundles (bare .AppImage / msi.zip) but no v1Compatible updater archives. " +
        'Set bundle.createUpdaterArtifacts to "v1Compatible" in src-tauri/tauri.conf.json — the feed serves ' +
        "the .app.tar.gz / -setup.nsis.zip / .AppImage.tar.gz names.",
    );
  }
  if (Object.keys(platforms).length === 0) {
    throw new Error(`No updater bundles found under ${searchRoots.join(", ")} — did the tauri build produce artifacts?`);
  }

  // One file per platform: the publish job flattens every runner's artifacts
  // into a single directory, so anything named fragment.json would overwrite
  // the other runners' findings.
  for (const [platform, asset] of Object.entries(platforms)) {
    await writeFile(
      path.join(outDir, `platform-${platform}.json`),
      `${JSON.stringify({ platform, asset }, null, 2)}\n`,
    );
  }

  console.log(`collected ${Object.keys(platforms).length} updater bundle(s) for ${args.version ?? "?"}:`);
  for (const [platform, name] of Object.entries(platforms)) console.log(`  ${platform} → ${name}`);
  for (const name of installers) console.log(`  installer → ${name}`);
  for (const clash of collisions) {
    console.log(`::warning title=Duplicate bundle::two bundles claimed ${clash} — build one target at a time.`);
  }
}

async function runMerge(args) {
  const fragmentsDir = String(args.fragments ?? "release-assets");
  const outDir = String(args.out ?? fragmentsDir);
  // --base-url / --notes-file arrive with dashes, args keys keep them.
  const baseUrl = String(args["base-url"] ?? "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("--base-url is required (the release download URL)");

  const files = await readdir(fragmentsDir).catch(() => []);
  const entries = [];
  const sigContent = {};
  for (const file of files) {
    if (file.endsWith(".sig")) {
      sigContent[file] = await readFile(path.join(fragmentsDir, file), "utf8");
      continue;
    }
    if (/^platform-.*\.json$/.test(file)) {
      entries.push(JSON.parse(await readFile(path.join(fragmentsDir, file), "utf8")));
    }
  }
  if (entries.length === 0) {
    throw new Error(`No platform-*.json found in ${fragmentsDir} — did the build jobs upload their artifacts?`);
  }

  const notes = args["notes-file"] ? await readFile(String(args["notes-file"]), "utf8") : "";
  const manifest = mergeFragments(entries, {
    version: String(args.version ?? ""),
    notes,
    pubDate: args["pub-date"] ? String(args["pub-date"]) : undefined,
    baseUrl,
    sigContent,
  });

  if (!manifest.version) throw new Error("--version is required");

  const expected = Object.keys(UPDATER_ASSETS);
  const missing = expected.filter((platform) => !manifest.platforms[platform]);
  for (const platform of missing) {
    console.log(`::warning::no signed updater bundle for ${platform} — its users will not be offered this release`);
  }

  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "latest.json");
  await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${outFile} (${Object.keys(manifest.platforms).length}/${expected.length} platforms)`);
}

const isCli = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isCli) {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const runner = command === "collect" ? runCollect : command === "merge" ? runMerge : null;
  if (!runner) {
    console.error("usage: updater-artifacts.mjs <collect|merge> [--flags]");
    process.exit(2);
  }
  runner(args).catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
