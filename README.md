# Aurelia Cast

Roku-style web receiver, multi-room WebRTC sync studio, and Roku BrightScript channel exporter — Hardware Console aesthetic (brushed obsidian, gold accents, hairline borders, tabular numerals).

Build document: [`docs/BUILD.md`](docs/BUILD.md) (v2 — includes reviewed decisions D1–D4).

## Quick Start

```bash
npm install
npm run dev            # custom server: Next.js + WebSocket signaling on http://127.0.0.1:3000
```

For LAN casting from other laptops, bind the host interface:

```bash
HOST=0.0.0.0 npm run dev
```

## Views

| Route              | View                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `/`                | Cast Sender — quick-cast bar, presets, recent re-cast, room remote     |
| `/receiver?room=…` | Receiver Studio — hls.js player, branded OSD, Roku D-pad, gesture gate |
| `/sync`            | Multi-Room sync monitor — offset / RTT / drift, syncing nodes          |
| `/devices`         | Output devices — per-node delay/volume/mute, room groups, Roku endpoints |
| `/library`         | Viewer history — filters, search, resume, favorites, delete            |
| `/roku`            | Roku Export — settings, file preview, `.zip` download                  |

## REST API

```bash
# Cast to a room (receivers auto-load the stream)
curl -X POST http://localhost:3000/api/cast \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8","roomId":"living-room"}'

# History
curl http://localhost:3000/api/history

# Health (ws status)
curl http://localhost:3000/api/health

# Roku channel package
curl -X POST http://localhost:3000/api/export-roku \
  -H 'Content-Type: application/json' \
  -d '{"title":"Aurelia Cast","port":8080,"accent":"Gold"}' -o aurelia-cast.zip
```

Set `CAST_TOKEN=<secret>` to require an `x-aurelia-token` header on `/api/cast`.
Set `NEXT_PUBLIC_ENABLE_STUN=true` to add public STUN for cross-subnet P2P.

## Multi-Room Sync

Enable **Multi-Room Sync** on one receiver (host). Other receivers in the room
auto-join as followers: NTP-style RTT/offset probes over an
`RTCDataChannel(aurelia-sync)`; drift > 120 ms hard-seeks, 20–120 ms nudges
playbackRate (≤ ±4%). If P2P is unavailable, followers fall back to WS-relayed
probes (control frames only, no media relay).

## Audio Delay Calibration

Each receiver runs `AudioContext → MediaElementSource → DelayNode(≤500 ms) →
Gain → destination`. Sliders glide via `setTargetAtTime` (no clicks). If a
stream lacks CORS or the context cannot start, the graph enters an explicit
`unavailable` state (amber banner, slider inert, direct playback) instead of
silently muting.

## Roku Sideload

The exported zip contains `manifest`, BrightScript/SceneGraph sources, and
`SIDELoad.md` with developer-mode steps and the `plugin_install` curl. The
channel listens on the configured port (default 8080):

```bash
curl "http://<roku-ip>:8080/play?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&title=My%20Stream"
```

## Tests

```bash
npm test           # vitest: clock math, thresholds, Roku package structure, zip smoke
npm run typecheck  # tsc --noEmit
npm run build      # next build
```

## Known Limitations

- Physical Roku ECP control from the browser is intentionally omitted
  (mixed-content policy); use the sideloaded channel's own HTTP receiver.
- BrightScript is validated structurally, not executed on hardware.
- Thumbnails are best-effort (only when the stream is CORS-readable).
- TURN is out of scope; configure one before attempting sync across the
  public internet.
