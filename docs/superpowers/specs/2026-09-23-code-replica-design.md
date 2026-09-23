# Vibecoder `/code` — opencode-style Agent Terminal Replica

**Date:** 2026-09-23
**Status:** Design approved (architectural path)

## Intent

Build a replica of the **opencode** coding assistant UI as two surfaces of one
React app: a live browser instance at `/code` on the running web instance, and
an installable macOS `.dmg` published to `/releases/` on the same site. The
replica wraps the real `opencode` CLI (via a PTY), so the full opencode TUI —
chat pane, streaming tool calls, file diffs, model picker, session sidebar —
comes for free and is not reimplemented.

**Who this is for:** a Vibecoder operator who wants an opencode-shaped agent
terminal available both in a browser and as a native desktop window.

**Success criteria:** opening `/code` in a browser renders a working opencode
terminal session; `localhost:3000/releases/Vibecoder-1.0.0-arm64-mac.dmg` serves
a DMG that installs and launches the same UI as a desktop app.

## Out of scope

- Auth, credits, billing, admin — the VibeCoder web product's concerns.
- Reimplementing the opencode agent (tool loop, file edits, diffs) — we spawn
  the real `opencode` CLI.
- Windows/Linux installers (macOS arm64 `.dmg` only, v1).
- BYOK, model routing UI beyond what opencode itself exposes, multi-user.

## Architecture

Standalone Vite + React 19 + TypeScript app in `VibeCoder/code/`, separate from
the Next.js landing app. Two runtime targets share the **same React components**:

1. **Browser (`/code`):** Vite dev/prod server + a small Node `ws` server
   (`code/server/pty.ts`) that owns `node-pty`, spawning `opencode`. React talks
   to it over a WebSocket; xterm.js streams terminal I/O.
2. **Desktop (`.dmg`):** Electron shell (`code/electron/`) whose main process
   owns the same PTY in-process (no server needed). The renderer loads the same
   React bundle, with terminal I/O bridged over IPC instead of WS.

Because both targets drive the same PTY abstraction, the UI is identical.

### Directory layout

```
code/
  package.json            # scripts: dev (web+ws), dev:electron, dist
  vite.config.ts
  electron-builder.yml    # product "Vibecoder", arm64 mac dmg
  electron/
    main.ts               # BrowserWindow + PTY spawn + IPC bridge
    preload.ts            # contextBridge exposing pty write/onData
    pty.ts                # shared PTY logic (spawn opencode, resize, kill)
  server/
    pty.ts                # ws server wrapping the same pty logic
    index.ts              # vite plugin / standalone ws entry
  src/
    App.tsx               # dark opencode-style shell
    components/
      TerminalPane.tsx    # xterm.js + fit addon + I/O transport
      SessionSidebar.tsx  # lists opencode sessions
      ModelBar.tsx        # top bar: model picker + new-session control
      Transport.ts        # abstraction: WebSocket (web) | IPC (electron)
    styles/
  scripts/
    build-dmg.mjs         # electron-builder → dmg
    publish-dmg.mjs       # copy dmg → ../public/releases/
  public/
    (nothing; dmg published to web repo's public/)
```

The web repo gains:

```
public/releases/Vibecoder-1.0.0-arm64-mac.dmg   # built artifact, served by Next
src/app/releases/page.tsx                        # download page (link from landing)
```

### PTY spawning

`pty.ts` resolves the `opencode` binary on `PATH` (using `which`/`where`
equivalent). If missing, the transport reports `missing` and the UI renders an
**install screen** with the ready-to-paste install command. This is the v1
answer to "opencode isn't installed on this machine"; bundling the binary into
the DMG is a future enhancement, not in v1.

### Security notes

- The PTY runs with the user's own privileges in their own workspace — same
  trust model as running `opencode` in a terminal. No new privilege boundary.
- WebSocket server binds to `127.0.0.1` only (never `0.0.0.0`) in v1.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, preload exposes
  only `ptyWrite`, `ptyResize`, `onPtyData` — no general IPC surface.
- Electron packaging: sign/notarize config deferred (unsigned local builds OK
  for v1).

## Data flow

**Browser:**
```
xterm.onData → Transport.send → WS → pty.write(opencode child)
opencode PTY output → pty.onData → WS → xterm.write
```

**Desktop:**
```
xterm.onData → Transport.send → IPC preload → pty.write
opencode PTY output → IPC → xterm.write
```

`Transport` is a tiny interface (`send(Uint8Array)`, `onData(cb)`,
`resize(cols, rows)`, `status()`), implemented by WS in web and by preload IPC
in Electron. Components never know which they're on.

## UI design

Follow `apple-design` (from `~/.agents/skills/apple-design/SKILL.md`) and
`web-design-guidelines` from the skills library before implementing, per
`PROMPT.md`'s rules. The opencode aesthetic: dark background, monospace
terminal dominant, subtle sidebar, minimal chrome.

- **TerminalPane** fills the primary area; font, cursor, and theme configured
  for the opencode look (dark palette, ANSI colors matching).
- **SessionSidebar** — lists sessions (read from opencode's session storage if
  accessible via the PTY host, or a simple client-side list in v1).
- **ModelBar** — top bar showing current model, a new-session control, and the
  install-status banner when `opencode` is missing.
- **Motion:** use `find-animation-opportunities`'s frequency/purpose/speed/function
  gate; expect rejections. The install screen can have a single subtle entrance
  transition; nothing bouncy.

## Error handling

- **`opencode` binary missing:** install screen with copyable command, retry
  button re-probes `PATH`.
- **PTY exits nonzero / crashes:** terminal shows the exit code; UI offers
  "restart session" which respawns the PTY.
- **WS disconnect (web):** Transport auto-reconnects with backoff; UI shows a
  "reconnecting" status in the ModelBar.
- **Websocket server not running (web):** terminal renders a clear
  "PTY server unavailable — run `pnpm dev` from `code/`" message.

## Testing

- **Unit (vitest):** `Transport` mock drives `TerminalPane` (output renders,
  input calls `send`); `pty.ts` binary resolution returns the missing-case when
  `which` finds nothing.
- **Integration:** spawn a stub binary (e.g. `cat`/`echo`) instead of
  `opencode` in tests so no API keys are needed — assert I/O round-trip.
- **Acceptance:** `pnpm lint`, `pnpm build` (both Vite and Next) clean;
  keyboard-only navigation of the `/code` shell; the built DMG exists at the
  expected path and Next serves it at `/releases/...`.

## Milestones

1. Scaffold `code/` (Vite + React + TS + ESLint + vitest), shared `Transport`
   + `TerminalPane` rendering a stub PTY.
2. `node-pty` integration in web (ws server), spawn real `opencode`, install
   screen when missing, reconnect handling.
3. SessionSidebar + ModelBar, opencode theme polish (apply `apple-design` +
   `web-design-guidelines`).
4. Electron shell (main/preload/renderer over IPC), `electron-builder` → arm64
   `.dmg`.
5. Publish DMG to `public/releases/`, add `/releases` download page + landing
   link; verify the exact URL serves the artifact.

Each milestone verified (lint/build/tests) before moving on.
