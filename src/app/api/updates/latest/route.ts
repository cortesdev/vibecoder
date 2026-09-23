import type { Channel } from "@/lib/updates";
import { resolveUpdate, isProUnlock } from "@/lib/updates";

// GET /api/updates/latest?platform=darwin-arm64&version=1.0.0&channel=beta&key=VBC-…
//
// The desktop app polls this on launch and every 6h. The site is the only
// public face of versioning: GitHub Releases stay the source of truth in git,
// but the endpoint can re-route, gate (beta = Pro), and hot-fix without app
// updates. Format matches the Tauri updater contract so the desktop shell can
// consume it directly.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform") ?? "";
  const version = searchParams.get("version") ?? "0.0.0";
  const channelParam = searchParams.get("channel") ?? "stable";
  const channel: Channel = channelParam === "beta" ? "beta" : "stable";

  // Pro unlock: license key param or a custom User-Agent header set by the app.
  const key = searchParams.get("key");
  const isPro = isProUnlock(req.headers.get("user-agent") ?? "", key);

  return resolveUpdate({ channel, platform, currentVersion: version, isPro });
}
