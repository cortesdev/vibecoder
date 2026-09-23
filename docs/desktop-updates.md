# Desktop auto-updates

The desktop app updates itself with **user permission and automatic restart**.
Versioning is published from **git** (GitHub Releases) and served by **this
site**, which the app polls — the app never talks to GitHub directly, so
routing, gating, and emergency fixes can happen server-side without shipping
an app update.

```
git (tag + release) ─▶ GitHub Releases ─▶ /api/updates/latest ─▶ desktop app
                                              │  (gate: beta = Pro)
                                              └─▶ signed installer ─▶ user approves ─▶ auto-restart
```

## 1. The app asks the site for updates

```
GET /api/updates/latest?platform=darwin-arm64&version=1.0.0&channel=stable
GET /api/updates/latest?platform=darwin-arm64&version=1.0.0&channel=beta&key=VBC-XXXXX-…
```

- `platform`: `darwin-arm64 | darwin-x86_64 | windows-x86_64 | linux-x86_64`
- `channel`: `stable` (default) or `beta` (**Pro only** — a license key or the
  app's custom User-Agent unlocks it; Pro benefits from the $49 upgrade)
- Response (Tauri updater contract):

```json
{ "ok": true, "update": null }                       // up to date
{ "ok": true, "update": { "version": "1.1.0", "notes": "…", "url": "https://…", "channel": "stable" } }
{ "ok": false, "reason": "pro_required" }            // beta without license
```

Poll cadence: on launch, then every 6 hours (with jitter).

## 2. Permission + automatic install + restart

The desktop shell (Tauri) handles the OS-level parts:

1. **Ask once**: on first update, a native dialog — "Install Vibecoder 1.1.0
   now?" with "Always install automatically" as the default button. The choice
   is persisted (`autoUpdate: true|false|ask`).
2. **Download in background**, verify the minisign **signature** against the
   public key baked into the binary.
3. **Install on quit or restart now**: the updater swaps the bundle and
   relaunches the app automatically. The user never visits the website.

## 3. Publishing a release (the git side)

1. Merge to `main`; bump the version in `src-tauri/tauri.conf.json`.
2. CI (`.github/workflows/release.yml`) builds installers for all three
   platforms on the `v*` tag, **signs** them, and creates a GitHub Release —
   prerelease when the version has a `-beta.N` suffix.
3. That's the whole release process. The site picks it up within 5 minutes
   (`revalidate: 300` on the GitHub API call).

## 4. Env

| Var | Purpose |
| --- | --- |
| `DESKTOP_RELEASES_REPO` | GitHub repo with releases (default `cortesdev/vibecoder`) |
| `GITHUB_TOKEN` | Optional: raises the API rate limit for the feed |

## 5. Honest status

- The **feed** (this file's API) is live in the site today.
- The **desktop shell** that consumes it (Tauri + updater + signing) is the
  next milestone; the contract above is frozen so site and app can be built
  independently.
