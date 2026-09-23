import { describe, expect, it } from "vitest";
import { assetForPlatform, compareVersions } from "../src/lib/updates";

describe("assetForPlatform", () => {
  it("maps all three desktop platforms", () => {
    expect(assetForPlatform("darwin-arm64")).toBe("Vibecoder_aarch64.app.tar.gz");
    expect(assetForPlatform("windows-x86_64")).toBe("Vibecoder_x64-setup.zip");
    expect(assetForPlatform("linux-x86_64")).toBe("Vibecoder_amd64.AppImage.tar.gz");
  });
  it("rejects unknown platforms", () => {
    expect(assetForPlatform("sunos-sparc")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders patch versions", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.9", "1.2.9")).toBe(0);
    expect(compareVersions("1.9.0", "2.0.0")).toBeLessThan(0);
  });
  it("ranks release above prerelease", () => {
    expect(compareVersions("1.2.9", "1.2.9-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.9-beta.2", "1.2.9-beta.1")).toBeGreaterThan(0);
  });
  it("ignores the v prefix upstream tag style", () => {
    expect(compareVersions("v1.2.9", "1.2.8")).toBeGreaterThan(0);
  });
});
