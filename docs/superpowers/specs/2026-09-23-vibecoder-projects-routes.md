# Vibecoder Projects — Routes Context

**Date:** 2026-09-23
**Status:** Design artifact for the Vibecoder Projects spec (Google login + Bolt-style project folders)

This is the route map for the Projects feature. Unlisted routes that already exist in the repo
(`/`, `/api/license/validate`, `/api/stripe/webhook`, `/api/upgrade/checkout`, `/upgrade/success`,
`/robots.txt`, `/sitemap.xml`, `/opengraph-image`) are unchanged by this feature.

## Auth model

- Session cookie: `vibecoder_session`, value = session token, flags `HttpOnly; SameSite=Lax; Path=/; Secure` in production (`Secure` omitted on `http://localhost`).
- Gate: any request under `/app*` without a valid unexpired session is **307 → `/login`**.
- All reads/writes are scoped to `session.userId` on the server; ownership is enforced server-side on every route, never trusted from the client.

## Route table

### Public — no session required

| Method | Path | Kind | Purpose | Notes |
|---|---|---|---|---|
| GET | `/login` | page | Google sign-in button; redirects to `/app` if already signed in | |
| GET | `/api/auth/google` | route | Starts OAuth2: generate `state`, store in an `httpOnly` cookie, 307 → `https://accounts.google.com/o/oauth2/v2/auth?...` | `GOOGLE_CLIENT_ID` from env |
| GET | `/api/auth/google/callback` | route | Verify `state`, exchange `code` for tokens, fetch profile, **upsert User**, create `Session`, set cookie, 307 → `/app` | On any failure: 307 → `/login?error=...` (no crash, no partial session) |
| POST | `/api/auth/logout` | route | Destroy session row + clear cookie, 307 → `/` | |

### Authenticated — session required (else 307 → `/login`)

| Method | Path | Kind | Purpose | Input | Response |
|---|---|---|---|---|---|
| GET | `/app` | page | Dashboard: list the user's projects, new-project form | — | Server component |
| POST | `/app/projects` | route | Create a project: name → scaffold the minimal Vite React template into `ProjectFile` rows | `{ name }` | 303 → `/app/projects/[id]` |
| GET | `/app/projects/[id]` | page | Builder: file tree + Monaco editor + chat prompt + change list | — | Server component; loads files + changes scoped to user |
| POST | `/app/projects/[id]/prompt` | route | Create `Prompt` row → run agent → write validated `Change` rows (NOT applied) | `{ prompt }` | `{ ok, changes: ChangeSummary[] }` |
| POST | `/app/projects/[id]/changes/[changeId]/apply` | route | Apply one change: write `after` to `ProjectFile`, status → `applied` | — | `{ ok }` |
| POST | `/app/projects/[id]/changes/[changeId]/revert` | route | Revert an applied change: restore `before` to `ProjectFile`, status → `reverted` | — | `{ ok }` |
| POST | `/app/projects/[id]/files/[path]` | route | Direct file save from the editor | `{ content }` | `{ ok }` |
| DELETE | `/app/projects/[id]` | route | Delete project (+ files, prompts, changes via cascade) | — | 303 → `/app` |

## App Router layout

```
src/app/
  login/page.tsx
  app/
    layout.tsx                 # auth gate: 307 → /login when no valid session
    page.tsx                   # dashboard (server component)
    projects/
      [id]/
        page.tsx               # builder (server component; client islands)
  api/
    auth/
      google/route.ts          # GET  → start OAuth
      google/callback/route.ts # GET  → finish OAuth
      logout/route.ts          # POST → destroy session
    app/
      projects/route.ts                                   # POST create
      projects/[id]/route.ts                              # DELETE
      projects/[id]/prompt/route.ts                       # POST run agent
      projects/[id]/changes/[changeId]/apply/route.ts     # POST
      projects/[id]/changes/[changeId]/revert/route.ts    # POST
      projects/[id]/files/[path]/route.ts                 # POST save
```

Note: `[path]` for the files route is a catch-all-ish dynamic segment; the browser encodes the file path
(`src` → `s%2Fr%2Fc` not needed — encodeURIComponent per segment), and the route re-validates it with the
path-sandbox rule before touching storage.

## Error handling

- Agent parse/validation failure → `{ ok: false, error }`, **zero** `Change` rows written (transactional).
- Path sandbox rejection → `{ ok: false, reason: "invalid_path" }`, nothing stored.
- Session expired/unknown → all `/app*` return 307 to `/login`; API routes return 401 JSON.

## Success criteria (routing)

- Unauthenticated `/app*` → `/login`; after Google sign-in → `/app` with the session cookie set.
- Create → scaffold → builder loads the React template files.
- Prompt → change list (diff shown) → apply updates editor content → revert restores it.
- Cross-user: `GET /app/projects/A` as user B returns 404 (not A's content).