// Update feed for the desktop app. Versioning is published through GitHub
// Releases (the "git" source of truth) and served through this site, which
// adds channels (stable/beta), platform asset resolution, and Pro gating for
// the beta channel. The desktop app polls this endpoint — it never talks to
// GitHub directly, so we can re-point releases without app updates.

export type Channel = "stable" | "beta";

export const DESKTOP_REPO = process.env.DESKTOP_RELEASES_REPO ?? "cortesdev/vibecoder";

/** Map the runtime platform to the release asset naming convention. */
export function assetForPlatform(platform: string): string | null {
  if (platform.startsWith("darwin-arm64")) return "Vibecoder_aarch64.app.tar.gz";
  if (platform.startsWith("darwin-x86_64")) return "Vibecoder_x64.app.tar.gz";
  if (platform.startsWith("windows-x86_64")) return "Vibecoder_x64-setup.zip";
  if (platform.startsWith("linux-x86_64")) return "Vibecoder_amd64.AppImage.tar.gz";
  return null;
}

/** semver-ish compare: 1.2.10 > 1.2.9 > 1.2.9-beta.1 > 1.2.8 */
export function compareVersions(a: string, b: string): number {
  // Tolerate the git tag style (v1.2.9) and anything unparsable: a NaN here
  // would make every comparison false, i.e. silently "no update".
  const core = (v: string) =>
    v
      .replace(/^v/, "")
      .replace(/-.*$/, "")
      .split(".")
      .map((part) => Number(part) || 0);
  const pre = (v: string) => (v.replace(/^v/, "").includes("-") ? v.split("-")[1] : "");
  const [a1, a2, a3] = core(a);
  const [b1, b2, b3] = core(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  if (a3 !== b3) return a3 - b3;
  const pa = pre(a);
  const pb = pre(b);
  if (pa === pb) return 0;
  if (!pa) return 1; // release > prerelease
  if (!pb) return -1;
  return pa.localeCompare(pb);
}

function isProUnlock(userAgent: string, keyParam: string | null): boolean {
  if (keyParam) return /^VBC-|TEST-/i.test(keyParam);
  return /VibecoderPro/i.test(userAgent);
}

interface GithubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/**
 * Resolve the newest applicable release for (channel, platform, pro).
 * Stable channel ignores prereleases; beta sees both.
 */
export async function resolveUpdate(input: {
  channel: Channel;
  platform: string;
  currentVersion: string;
  isPro: boolean;
}): Promise<Response> {
  const { channel, platform, currentVersion, isPro } = input;

  if (channel === "beta" && !isPro) {
    return Response.json(
      { ok: false, reason: "pro_required", message: "The beta channel is a Pro feature. Upgrade at vibecoder.io." },
      { status: 403 },
    );
  }

  const assetName = assetForPlatform(platform);
  if (!assetName) {
    return Response.json({ ok: false, reason: "unsupported_platform" }, { status: 400 });
  }

  try {
    const gh = await fetch(`https://api.github.com/repos/${DESKTOP_REPO}/releases?per_page=20`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "vibecoder-updates",
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      // Edge/ISR-friendly: re-check at most every 5 minutes.
      next: { revalidate: 300 },
    });
    if (!gh.ok) {
      return Response.json({ ok: false, reason: "upstream_error" }, { status: 502 });
    }
    const releases = (await gh.json()) as GithubRelease[];

    const candidates = releases.filter((r) => {
      if (r.draft) return false;
      if (channel === "stable" && r.prerelease) return false;
      return true;
    });
    const newest = candidates.find((r) => compareVersions(r.tag_name.replace(/^v/, ""), currentVersion) > 0);

    if (!newest) {
      return Response.json({ ok: true, update: null });
    }

    const asset = newest.assets.find((a) => a.name === assetName);
    if (!asset) {
      return Response.json({ ok: true, update: null });
    }

    const version = newest.tag_name.replace(/^v/, "");
    return Response.json({
      ok: true,
      update: {
        version,
        notes: newest.body ?? newest.name ?? "",
        pub_date: newest.assets[0] ? undefined : undefined,
        url: asset.browser_download_url,
        signature: undefined, // see docs/desktop-updates.md — set when signing is wired
        channel,
      },
    });
  } catch {
    return Response.json({ ok: false, reason: "upstream_error" }, { status: 502 });
  }
}

export { isProUnlock };
