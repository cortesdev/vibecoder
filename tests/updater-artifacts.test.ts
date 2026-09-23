import { describe, expect, it } from "vitest";
import {
  INSTALLER_ASSETS,
  UPDATER_ASSETS,
  classify,
  mergeFragments,
} from "../scripts/updater-artifacts.mjs";
import { assetForPlatform } from "../src/lib/updates";

// The workflow and the live feed must agree on asset names, or signing ships
// artifacts the app can never find. These assertions are that seam.

describe("canonical updater assets", () => {
  it("match the names the update feed serves", () => {
    expect(assetForPlatform("darwin-arm64")).toBe(UPDATER_ASSETS["darwin-aarch64"]);
    expect(assetForPlatform("darwin-x86_64")).toBe(UPDATER_ASSETS["darwin-x86_64"]);
    expect(assetForPlatform("windows-x86_64")).toBe(UPDATER_ASSETS["windows-x86_64"]);
    expect(assetForPlatform("linux-x86_64")).toBe(UPDATER_ASSETS["linux-x86_64"]);
  });

  it("cover every platform the feed knows about", () => {
    for (const platform of ["darwin-arm64", "darwin-x86_64", "windows-x86_64", "linux-x86_64"]) {
      expect(assetForPlatform(platform)).toBeTruthy();
    }
    expect(Object.keys(UPDATER_ASSETS)).toHaveLength(4);
  });
});

describe("classify", () => {
  it("names the macOS updater bundle per target, not per filename", () => {
    // Tauri emits the same `Vibecoder.app.tar.gz` for both mac targets; the
    // target triple in the path is the only thing telling them apart.
    expect(classify("target/aarch64-apple-darwin/release/bundle/macos/Vibecoder.app.tar.gz", "Vibecoder.app.tar.gz")).toEqual({
      name: "Vibecoder_aarch64.app.tar.gz",
      platform: "darwin-aarch64",
      updater: true,
    });
    expect(
      classify("target/x86_64-apple-darwin/release/bundle/macos/Vibecoder.app.tar.gz", "Vibecoder.app.tar.gz").name,
    ).toBe("Vibecoder_x64.app.tar.gz");
  });

  it("prefers an arch token in the filename when the path has no triple", () => {
    expect(classify("bundle/macos/Vibecoder_1.0.0_aarch64.app.tar.gz", "Vibecoder_1.0.0_aarch64.app.tar.gz").platform).toBe(
      "darwin-aarch64",
    );
  });

  it("maps the Windows and Linux updater bundles", () => {
    expect(classify("target/x86_64-pc-windows-msvc/release/bundle/nsis/Vibecoder_1.0.0_x64-setup.nsis.zip", "Vibecoder_1.0.0_x64-setup.nsis.zip")).toEqual({
      name: "Vibecoder_x64-setup.zip",
      platform: "windows-x86_64",
      updater: true,
    });
    expect(
      classify("target/x86_64-unknown-linux-gnu/release/bundle/appimage/Vibecoder_1.0.0_amd64.AppImage.tar.gz", "Vibecoder_1.0.0_amd64.AppImage.tar.gz"),
    ).toEqual({ name: "Vibecoder_amd64.AppImage.tar.gz", platform: "linux-x86_64", updater: true });
  });

  it("maps the versionless human installers the download buttons link to", () => {
    expect(classify("bundle/dmg/Vibecoder_1.0.0_aarch64.dmg", "Vibecoder_1.0.0_aarch64.dmg").name).toBe(INSTALLER_ASSETS["darwin-aarch64"]);
    expect(classify("bundle/dmg/Vibecoder_1.0.0_x64.dmg", "Vibecoder_1.0.0_x64.dmg").name).toBe(INSTALLER_ASSETS["darwin-x86_64"]);
    expect(classify("bundle/nsis/Vibecoder_1.0.0_x64-setup.exe", "Vibecoder_1.0.0_x64-setup.exe").name).toBe(
      INSTALLER_ASSETS["windows-x86_64"],
    );
    expect(classify("bundle/deb/Vibecoder_1.0.0_amd64.deb", "Vibecoder_1.0.0_amd64.deb").name).toBe(INSTALLER_ASSETS["linux-x86_64-deb"]);
    expect(classify("bundle/rpm/Vibecoder-1.0.0-1.x86_64.rpm", "Vibecoder-1.0.0-1.x86_64.rpm").name).toBe(
      INSTALLER_ASSETS["linux-x86_64-rpm"],
    );
  });

  it("ignores everything it does not publish", () => {
    expect(classify("bundle/appimage/Vibecoder_1.0.0_amd64.AppImage", "Vibecoder_1.0.0_amd64.AppImage")).toBeNull();
    expect(classify("target/release/vibecoder", "vibecoder")).toBeNull();
    expect(classify("bundle/nsis/Vibecoder_1.0.0_x64-setup.exe.sig", "Vibecoder_1.0.0_x64-setup.exe.sig")).toBeNull();
  });
});

describe("mergeFragments", () => {
  const fragments = [
    { platforms: { "darwin-aarch64": "Vibecoder_aarch64.app.tar.gz", "darwin-x86_64": "Vibecoder_x64.app.tar.gz" } },
    { platforms: { "windows-x86_64": "Vibecoder_x64-setup.zip" } },
    { platforms: { "linux-x86_64": "Vibecoder_amd64.AppImage.tar.gz" } },
  ];
  const sigContent = {
    "Vibecoder_aarch64.app.tar.gz.sig": "sig-aarch64\n",
    "Vibecoder_x64.app.tar.gz.sig": "sig-x64\n",
    "Vibecoder_x64-setup.zip.sig": "sig-win\n",
    "Vibecoder_amd64.AppImage.tar.gz.sig": "sig-linux\n",
  };
  const base = "https://github.com/cortesdev/vibecoder/releases/download/v1.1.0";

  it("builds a complete Tauri manifest with signature contents and download urls", () => {
    const manifest = mergeFragments(fragments, { version: "1.1.0", notes: "Fixes", pubDate: "2026-09-23T00:00:00Z", baseUrl: base, sigContent });

    expect(manifest.version).toBe("1.1.0");
    expect(manifest.notes).toBe("Fixes");
    expect(manifest.pub_date).toBe("2026-09-23T00:00:00Z");
    expect(Object.keys(manifest.platforms)).toHaveLength(4);
    expect(manifest.platforms["darwin-aarch64"]).toEqual({
      signature: "sig-aarch64", // the .sig file's content, trimmed — not a path
      url: `${base}/Vibecoder_aarch64.app.tar.gz`,
    });
    expect(manifest.platforms["windows-x86_64"].url).toBe(`${base}/Vibecoder_x64-setup.zip`);
  });

  it("drops platforms whose signature is missing rather than advertise an unverifiable update", () => {
    const manifest = mergeFragments(fragments, {
      version: "1.1.0",
      baseUrl: base,
      sigContent: { "Vibecoder_aarch64.app.tar.gz.sig": "sig\n" },
    });

    expect(Object.keys(manifest.platforms)).toEqual(["darwin-aarch64"]);
  });
});
