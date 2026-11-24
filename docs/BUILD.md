# Aurelia Cast — Build Document v2
**Roku-Style Receiver · Multi-Room WebRTC Studio · Channel Exporter**

> Status: v2 rebuild after review. Four open decisions (D1–D4) locked in during review Q&A; see `§8 Decisions` for chosen options.
>
> Chosen this build:
> - **D1 Delivery** — Sandbox-only workspace build, no GitHub push (user may name a repo later to export).
> - **D2 Sync network** — Same-LAN/Same-origin first; host-candidate P2P + loopback signaling; public STUN `stun:stun.l.google.com:19302` offered via config flag, TURN out of scope.
> - **D3 Roku scope** — Full randomized-but-valid BrightScript/SceneGraph package generation + `.zip` download; verified for structure/lint only; documented sideload procedure.
> - **D4 Playback gateway** — Interruption-aware gate: first cast shows a "Press to Start" audio disarm screen that doubles as the browser autoplay unlock gesture; subsequent casts auto-resume with sound.

---

## 1. Overview

A self-hosted web studio that:
1. Accepts HLS (`.m3u8`) and MP4 stream URLs from a laptop **Cast Sender** view (UI) or a REST endpoint.
2. Plays them in a custom branded **Aurelia Cast** 16:9 receiver player with Roku-style OSD and D-pad control.
3. Synchronizes playback across multiple receiver nodes via real **WebRTC `RTCDataChannel`** clock sync (RTT–offset NTP-style probes + drift correction), and layers per-speaker **Web Audio `DelayNode`** delay (0–500 ms) for acoustic alignment.
4. Persists a viewer history library (last position, format, favorite, play count) server-side.
5. Exports a **sideloadable Roku BrightScript/SceneGraph channel** (`.zip`) with configurable port/title/accent.

Non-goals this build: TURN infrastructure, DRM/Widevine, transcoding, user accounts/multi-tenancy, physical Roku ECP control from browser (blocked by mixed content, documented as out-of-scope).

## 2. Prior-Plan Corrections Baked In

| # | Problem in v1 | v2 Resolution |
|---|---|---|
| C1 | Doc truncated, no phases/acceptance criteria | §7 phases, §9 acceptance criteria |
| C2 | `/api/export` vs `/api/export-roku` drift | Single canonical route list (§5) |
| C3 | ECP/signaling-bus conflation | Three transports explicitly separated, with routing table (§5) |
| C4 | Autoplay blocker unhandled | D4 gate-flow (§4.6) |
| C5 | Mixed-content ECP attempt would fail silently | Physical Roku control removed; Roku pipeline is sideload package only; documented alternative (postman/curl → `:8080`) |
| C6 | No ICE strategy | D2: host candidates + optional STUN flag (§5.3) |
| C7 | Sync vs delay conflated | Two independent subsystems with separate UI (§4.4, §4.5) |
| C8 | Web Audio CORS/suspend mute trap | Explicit fallback state + UI stale-delay guard (§4.5) |
| C9 | Thumbnails assumed | Only derived when CORS permits; otherwise	format badge placeholder (§4.7) |
| C10 | JSON-store write races | Single-writer append + fsync + serialized queue (§6.3) |
| C11 | Unauthenticated cast endpoint | Optional `CAST_TOKEN` bearer; loopback warning when unset (§10) |

## 3. Tech Stack (locked)

- **Runtime**: Node.js 20+, Next.js 15 (App Router, TypeScript, strict).
- **Custom server**: `server.js` — mounts Next handler on shared HTTP; attaches `ws` WebSocketServer at `/ws`.
- **Player**: `hls.js` (dynamic `import()` in client component only) + native HLS on Safari.
- **Sync transport**: `RTCPeerConnection` + `RTCDataChannel('aurelia-sync')`; `WebSocket` signaling only.
- **Audio graph**: `AudioContext → MediaElementAudioSourceNode → DelayNode(≤0.5 s) → GainNode → destination`.
- **State**: React state + `zustand` stores; no server components touching live state.
- **Persistence**: server-side JSON append-log at `data/aurelia.json` + atomic compaction; mirrored read cache in `localStorage`.
- **Package export**: `archiver` for `.zip` on dev dep; BrightScript source generated from string templates (server route).
- **Styling**: Tailwind CSS v4, no UI kit. Fonts: Outfit / DM Sans / JetBrains Mono via `next/font`.

## 4. Views & Key Flows

### 4.1 Workspace shell
- Fixed 248 px left rail: Cast Sender · Receiver Studio · Multi-Room Sync · Devices · Library · Roku Export.
- Top bar: wordmark · breadcrumb · primary **Cast URL** button.
- Palette: Deep Obsidian `#0B0C0F` 60% · Slate panels `#13151A`/`#1A1D24` 30% · Brushed Gold `#D4AF37` 10% + semantic Emerald/Amber/Crimson. Hairline borders `#262A34`. Single-elevation panels, no nested cards, no pill clutter.

### 4.2 Cast Sender
- Quick-cast bar: URL input (HLS/MP4), preset chips (curated CORS-ready test streams), target selector (room + optional device subset), **Cast** button.
- Presets: (a) Big Buck Bunny MP4, (b) Mux test HLS `*.m3u8`, (c) Sintel HLS, (d) custom URL. Auto-classified by extension; HEAD-probe to confirm reachability.
- REST equivalent (§5 route `POST /api/cast`) accepted with `x-aurelia-token` when `CAST_TOKEN` set.

### 4.3 Receiver Studio
- 16:9 stage; OSD auto-hide after 3 s idle. OSD shows: title, format badge (HLS/MP4), bitrate/resolution readout, buffered-range scrub bar (gold handle), delay badge (`Δ 0 ms`), volume bar.
- D-pad remote panel + keyboard bindings: Space=play/pause ←/→=±10 s ↑/↓=volume M=mute I=info(OSD) Esc=back Backspace=home.
- Every cast/play event enqueues a history item.

### 4.4 Multi-Room Sync (drift & clock)
- Host toggles *Enable Sync* → becomes session leader, publishes `{play,pause,seek,hostTimeMs,mediaTimeMs}` frames at ≥2 Hz.
- Each follower opens `RTCDataChannel('aurelia-sync')` to host; runs `RTT/2`-corrected offset probes every 1 s:
  `t0` sent → host acks with `hostTimeMs` → `t1` received; offset = `hostTimeMs - (t0+t1)/2`; drift = `localTime + offset - mediaClock`.
- Drift >120 ms → hard seek. Drift 20–120 ms → `playbackRate` nudge ≤ ±4% until |drift|<20 ms, eased over 2 s.
- Status LEDs in Sync view: Nominal (emerald) / Nudging (amber) / Recovering (crimson). Header shows worst-case `driftMs`.

### 4.5 Output Devices — Audio Delay Calibration
- Independent of drift-sync. Per-device slider 0–500 ms wired to `DelayNode.delayTime.setTargetAtTime(ms/1000, now, 0.05)` for click-free glide.
- Room groups: Theater / Living Room / Kitchen / Studio; per-device volume & mute → WebRTC control messages, applied on the device that owns the speaker.
- **Web Audio fallback guards** (v1 gap C8): if the stream host lacks CORS or the `AudioContext` is suspended, the pipeline enters a `warmIndex: 'muted'` state; delay slider renders disabled with amber tip "Audio graph unavailable — delay not applied", and we detach the media-element source to restore direct playback rather than leave silent output.

### 4.6 Playback Gate (autoplay policy, D4)
- First cast on any receiver: branded "Press to Start Audio" overlay (gold ring) — the gesture doubles as `AudioContext.resume()`.
- Afterwards, casts auto-resume with sound; a house-branded toast confirms.
- If a hard-block still occurs (iOS Safari low-power mode), receiver falls back to muted autoplay + subtle unmute hint.

### 4.7 Library & History
- Server-side `aureliaHistory` JSON store (§6.3). Fields: `id, title, url, format, lastPositionSec, durationSec, playedAt, playCount, isFavorite, thumbnailUrl?`.
- Filters: Recent / Favorites; search by title/URL; resume button (single-node playback only — suppressed while a sync session is active, per v1 gap C15).
- Thumbnail: derived from `<video>` frame grab only when stream is CORS-readable (canvas → dataURL, capped 320×180 WebP); otherwise no image + format-colored monogram tile.

## 5. Transport & API Contract (single canonical list)

### 5.1 REST (Next route handlers, `/app/api/*`)
- `POST /api/cast` — body `{url, targetRoomId, deviceIds?, title?}` → broadcasts `session.cast` over WS to room, returns `{sessionId, roomId, acceptedAt}`.
- `GET  /api/cast/stream` — SSE fallback mirror of WS cast/control bus for clients where WS is blocked (receivers auto-degrade).
- `GET/POST /api/history` — read/persist history (server store).
- `POST /api/export-roku` — body `{title, port, accent}` → returns `application/zip` (§4.8).
- `GET  /api/health` — returns `{ws: 'up' | 'down', uptimeSec}` (used by the top-bar status LED).

### 5.2 WebSocket (`/ws`) message envelope
`{v:2, type, roomId, fromId, ts, payload}` — Types: `presence hello/bye`, `room.join/leave`, `cast`, `ctl` (play/pause/seek/vol/mute/info/back/home), `sync.frame`, `sync.ping/pong`, `device.telemetry`.

### 5.3 WebRTC peers
- Signaling only through `/ws`; `RTCPeerConnection` uses host + mDNS candidates by default.
- Optional `NEXT_PUBLIC_ENABLE_STUN=true` injects `stun:stun.l.google.com:19302`. TURN explicitly out of scope (documented); sync falls back to WS relay of control frames (not media) when P2P fails — a visible, weaker-but-working mode, not a silent hang.

## 4.8 Roku Export
- Options: Channel title, receiver HTTP port (default 8080), accent preset (Gold/Obsidian/Slate/Crimson).
- Generated archive:
  - `manifest` — title, `mm_subtitles`… scene entry, `bs_const`, `ui_resolutions=fhd`.
  - `source/main.brs` — bootstraps `roSGScreen`, loads `ReceiverScene`, starts `HttpServerTask`.
  - `source/components/HttpServerTask.brs` — `roStreamSocket` listener; `GET /play?url=...&title=...` triggers `Video` node; `GET /stop`; CORS-friendly minimal responses; port from manifest.
  - `source/components/ReceiverScene.xml` + `.brs` — `Video` node, `onKeyEvent` D-pad mapping (OK=play/pause, ⏪/⏩=±30 s, Back=stop), OSD Text node overlay in chosen accent.
  - `source/components/HistoryRegistry.brs` — `roRegistrySection("History")` persistence mirroring web schema keys.
- zip verified for: manifest keys parse, non-empty SceneGraph XML, `.brs` length > 0, port in [8080, 8081]. Cannot be executed in-sandbox (documented limitation, §10).
- Include `SIDELoad.md` in the zip root with enable-dev-mode steps and `curl http://<rokudb-ip>/plugin_install` guidance.

## 6. Data & State

### 6.1 Entities (TypeScript types in `src/lib/types.ts`)
`OutputDevice`, `RoomSession`, `HistoryItem`, `SyncPeer`, `RokuExportSettings`.

### 6.2 Client stores (zustand)
`useCastStore`, `useDeviceStore`, `useSyncStore`, `useHistoryStore`.

### 6.3 Server store (`server/store.ts`)
- In-memory Map, append-log JSONL at `data/history.jsonl` (one change per line, fsync every batch).
- Atomic compaction to `data/history.json` on every 200 events or on SIGINT.
- Single writer queue (async mutex) — resolves v1 gap C10.

## 7. Implementation Phases

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | Scaffold, custom `server.js` + WS, layout/rail/theme, fonts | `next build` passes |
| P1 | Cast Sender + REST `/api/cast` + Receiver Studio + hls.js + OSD + D-pad | Manual cast round-trip, keyboard bindings |
| P2 | Multi-Room: signaling, peers, DataChannel clock sync + drift engine | Two browser nodes converge < 20 ms |
| P3 | Web Audio graph, per-device delay, room groups, fallback guards | Slider glide audible/no clicks; fallback state verified |
| P4 | Library handlers + store + filters/resume/favorites; thumbnails (best-effort) | Resume honored; tombstones on unknown URLs |
| P5 | Roku exporter + code preview + zip; unit tests for manifest/codegen, clock math | Zip builds, tests green |
| P6 | Polish: toasts, skeletons, empty/error states, README, SIDELoad guide | Acceptance run-through §9 |

## 8. Decisions (locked at review)

- **D1 Delivery** — Sandbox build, no GitHub push (user may name a repo later to export).
- **D2 Sync network** — LAN/same-host front; optional STUN flag; no TURN.
- **D3 Roku scope** — Full randomized-but-valid BrightScript package generation + `.zip` download; verified structure/lint only; documented sideload procedure.
- **D4 Playback gate** — Interruption-aware gesture gate, then auto-resume.

## 9. Acceptance Criteria

1. `npm run dev` boots `server.js`, `/api/health` returns `{ws:'up'}`.
2. Cast from Sender reaches an open Receiver tab in <250 ms, plays with OSD, enqueues history.
3. Two synced nodes converge to |drift| < 20 ms within 5 s of joining.
4. Delay sliders glide 0→500 ms without audio clicks; fallback engages correctly on a CORS-blocked test URL.
5. History persists across server restart (JSONL replay), resumes only when no active sync session.
6. `/api/export-roku` returns a 200 zip that is `unzip -t` clean and contains all six expected files.
7. `npx tsc --noEmit` + `next build` + `vitest run` all green.
8. Keyboard bindings §4.3 all fire.

## 10. Known Limitations & Security Notes

- **Physical Roku control from the browser is intentionally omitted**: browser mixed-content policy blocks `http://<roku-ip>:8060/...` (ECP) calls from an HTTPS page. Manual control via the sideloaded channel's own `:8080` HTTP endpoint (e.g. `curl "http://<roku-ip>:8080/play?url=..."`) — documented in `SIDELoad.md` inside every exported zip.
- **`/api/cast` unauthenticated by default** for friction-free LAN use. Set `CAST_TOKEN=<secret>` to require a matching bearer header. Never expose this server to the public internet either way; no auth浇水 beyond the token.
- **Roku package validity**: BrightScript is generated from vetted templates and passes structural checks, but runtime validation requires actual hardware; the `SIDELoad.md` steps are the verification path.
- **Web Audio**: delay only applies once `AudioContext` is running and stream is CORS-readable; receiver shows telemetry either way (no silent lies).
- **Thumbnails**: best-effort, only when CORS permits; graceful monogram fallback.
