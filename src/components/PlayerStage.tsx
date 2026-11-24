"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { useWs, envelope, type Envelope } from "@/lib/ws-client";
import { PeerManager } from "@/lib/webrtc";
import { AudioChain } from "@/lib/audio";
import {
  reconcile,
  targetMediaSec,
  syncStatus,
  formatTimecode,
} from "@/lib/sync";
import { RemotePad, REMOTE_KEYS, type RemoteAction } from "@/components/RemotePad";
import { Led } from "@/components/Chrome";
import { useDeviceStore, useSyncStore, useToastStore, ROOM_GROUPS } from "@/stores/deviceStore";
import type { SyncFrame } from "@/lib/types";

interface Session {
  url: string;
  title: string;
  format: "hls" | "mp4";
  resumeSec: number;
}

export function PlayerStage({ roomId, name }: { roomId: string; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioRef = useRef<AudioChain>(new AudioChain());
  const peerRef = useRef<PeerManager | null>(null);
  const frameRef = useRef<SyncFrame | null>(null);
  const lastProgressSave = useRef(0);
  const capturedThumbUrl = useRef<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [armed, setArmed] = useState(false);
  const [gate, setGate] = useState(false);
  const [meta, setMeta] = useState<{ res: string; bitrate: string; buffered: number }>({
    res: "—",
    bitrate: "—",
    buffered: 0,
  });
  const [osdVisible, setOsdVisible] = useState(false);
  const [role, setRole] = useState<"host" | "follower" | null>(null);
  const [delayMs, setDelayMs] = useState(0);
  const [roomGroup, setRoomGroup] = useState("Living Room");
  const [audioState, setAudioState] = useState<"idle" | "ready" | "unavailable">("idle");

  useEffect(() => {
    setDelayMs(Number(localStorage.getItem("aurelia-delay-ms") ?? 0));
    setRoomGroup(localStorage.getItem("aurelia-room-group") ?? "Living Room");
    setArmed(sessionStorage.getItem("aurelia-armed") === "1");
  }, []);

  const deviceStore = useDeviceStore();
  const syncStore = useSyncStore();
  const toast = useToastStore((s) => s.push);

  const ws = useWs(roomId, name, (msg) => handleMsg(msg));

  const showOsd = useCallback(() => {
    setOsdVisible(true);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsdVisible(false), 3000);
  }, []);

  const saveProgress = useCallback(
    (positionSec: number, durationSec: number) => {
      if (!session) return;
      void fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: session.url,
          title: session.title,
          format: session.format,
          lastPositionSec: Math.floor(positionSec),
          durationSec: Math.floor(durationSec),
        }),
      });
    },
    [session]
  );

  const captureThumbnail = useCallback(() => {
    const video = videoRef.current;
    if (!video || !session || capturedThumbUrl.current === session.url) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/webp", 0.55);
      if (dataUrl.length > 20000) {
        capturedThumbUrl.current = session.url;
        void fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: session.url,
            title: session.title,
            format: session.format,
            thumbnailUrl: dataUrl,
            lastPositionSec: Math.floor(video.currentTime),
          }),
        });
      }
    } catch {
      /* tainted canvas — thumbnail stays absent, monogram fallback in Library */
    }
  }, [session]);

  const loadStream = useCallback(
    async (next: Session) => {
      const video = videoRef.current;
      if (!video) return;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.crossOrigin = "anonymous";
      setSession(next);
      setGate(!armed);

      if (next.format === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
        const { default: HlsCtor } = await import("hls.js");
        const hls = new HlsCtor({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          setMeta((m) => ({ ...m, res: "manifest ok" }));
        });
        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_e, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setMeta((m) => ({
              ...m,
              res: level.height ? `${level.width}×${level.height}` : "—",
              bitrate: `${Math.round((level.bitrate ?? 0) / 1000)} kbps`,
            }));
          }
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            toast(`HLS error: ${data.details}`, "err");
          }
        });
        hls.loadSource(next.url);
        hls.attachMedia(video);
      } else {
        video.src = next.url;
      }

      const chain = audioRef.current;
      const attached = await chain.attach(video, next.url);
      setAudioState(chain.getState());
      if (attached) chain.setDelayMs(delayMs);
    },
    [armed, delayMs, toast]
  );

  const beginPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !session) return;
    setArmed(true);
    sessionStorage.setItem("aurelia-armed", "1");
    await audioRef.current.resume();
    try {
      await video.play();
      toast("Audio unlocked — receiver armed", "ok");
    } catch {
      video.muted = true;
      await video.play();
      toast("Autoplay still blocked — playing muted", "warn");
    }
    setGate(false);
    showOsd();
  }, [session, showOsd, toast]);

  const hostCbs = useCallback(
    () => ({
      send: ws.send,
      onProbeResult: (offsetMs: number, rttMs: number) => syncStore.setProbe(offsetMs, rttMs),
      onPeerConnected: () => {
        syncStore.setPeers(useSyncStore.getState().peerCount + 1);
        syncStore.setMode(peerRef.current?.getMode() === "relay" ? "relay" : "webrtc");
      },
      onPeerDisconnected: () => {
        syncStore.setPeers(Math.max(0, useSyncStore.getState().peerCount - 1));
      },
      onModeChange: (mode: "webrtc" | "relay") => syncStore.setMode(mode),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.send]
  );

  const followerCbs = useCallback(
    () => ({
      send: ws.send,
      onProbeResult: (offsetMs: number, rttMs: number) => {
        syncStore.setProbe(offsetMs, rttMs);
      },
      onPeerConnected: () => {
        syncStore.setPeers(useSyncStore.getState().peerCount + 1);
        syncStore.setMode(peerRef.current?.getMode() === "relay" ? "relay" : "webrtc");
      },
      onPeerDisconnected: () => {
        syncStore.setPeers(Math.max(0, useSyncStore.getState().peerCount - 1));
      },
      onModeChange: (mode: "webrtc" | "relay") => {
        syncStore.setMode(mode);
        toast(`P2P unavailable — clock sync over WS relay (${mode})`, "warn");
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.send, toast]
  );

  const handleMsg = useCallback(
    (msg: Envelope) => {
      const video = videoRef.current;
      switch (msg.type) {
        case "presence": {
          const list = (msg.payload as { list: { id: string; name: string }[] }).list;
          deviceStore.upsertPresence(list, ws.selfId ?? "");
          return;
        }
        case "cast": {
          const p = msg.payload as { url: string; title: string; format: "hls" | "mp4"; resumeSec: number };
          void loadStream({ url: p.url, title: p.title, format: p.format, resumeSec: p.resumeSec ?? 0 });
          toast(`Cast received: ${p.title}`, "ok");
          return;
        }
        case "ctl": {
          if (!video || (msg.targetId && msg.targetId !== ws.selfId)) return;
          applyCtl(msg.payload as { action: string; value?: number; valueMs?: number }, video);
          showOsd();
          return;
        }
        case "sync.frame": {
          frameRef.current = msg.payload as SyncFrame;
          if (role === "follower" && video) {
            const frame = frameRef.current;
            if (frame.isPlaying && video.paused && !gate) void video.play().catch(() => undefined);
            if (!frame.isPlaying && !video.paused) video.pause();
          }
          return;
        }
        case "sync.ping": {
          if (role === "host" && peerRef.current) {
            peerRef.current.handleRelayPing(msg.fromId!, msg.payload as { seq: number; t0: number });
          }
          return;
        }
        case "webrtc.announce":
        case "webrtc.sdp":
        case "webrtc.ice": {
          peerRef.current?.onWsMessage(msg);
          return;
        }
        case "device.telemetry": {
          if (msg.fromId !== ws.selfId) {
            deviceStore.applyTelemetry(msg.fromId!, msg.payload as never);
          }
          return;
        }
        case "sync.toggle": {
          const p = msg.payload as { enabled: boolean; hostId: string };
          if (p.enabled && role === null && ws.selfId && p.hostId !== ws.selfId) {
            setRole("follower");
            const peer = new PeerManager("follower", roomId, ws.selfId, followerCbs());
            peer.setHostId(p.hostId);
            peerRef.current = peer;
            peer.start();
            syncStore.setMode("pending" as never);
          }
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, role, gate, ws.selfId, loadStream, showOsd, followerCbs]
  );

  const toggleSync = useCallback(
    (enable: boolean) => {
      const selfId = ws.selfId;
      if (!selfId) {
        toast("Not connected to room yet", "warn");
        return;
      }
      peerRef.current?.dispose();
      peerRef.current = null;
      syncStore.setMode(enable ? "pending" : "off");
      syncStore.setPeers(0);
      if (enable) {
        setRole("host");
        peerRef.current = new PeerManager("host", roomId, selfId, hostCbs());
        ws.send(envelope("sync.toggle", roomId, { enabled: true, hostId: selfId }));
        toast("Multi-room sync enabled — you are the session host", "ok");
      } else {
        setRole(null);
        frameRef.current = null;
        syncStore.setDrift(null);
        ws.send(envelope("sync.toggle", roomId, { enabled: false, hostId: selfId }));
      }
    },
    [ws, roomId, hostCbs, toast, syncStore]
  );

  useEffect(() => {
    if (role !== "host") return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      ws.send(
        envelope("sync.frame", roomId, {
          url: session?.url ?? null,
          isPlaying: !video.paused && !video.ended,
          mediaTimeMs: video.currentTime * 1000,
          hostTimeMs: Date.now(),
          playbackRate: video.playbackRate,
        })
      );
    }, 500);
    return () => clearInterval(timer);
  }, [role, roomId, session, ws]);

  useEffect(() => {
    if (role !== "follower") return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const frame = frameRef.current;
      const offset = useSyncStore.getState().offsetMs;
      if (!video || !frame || offset === null) return;
      if (!frame.isPlaying || video.paused || video.seeking) return;
      if (Date.now() - frame.hostTimeMs > 4000) return;
      const target = targetMediaSec(frame, Date.now(), offset);
      const verdict = reconcile(video.currentTime, target);
      if (verdict.action === "seek") {
        video.currentTime = target;
        syncStore.setDrift((target - video.currentTime) * 1000);
      } else if (verdict.action === "rate") {
        video.playbackRate = verdict.rate;
        syncStore.setDrift((target - video.currentTime) * 1000);
      } else {
        video.playbackRate = 1;
        syncStore.setDrift(0);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || !ws.selfId) return;
      const probe = useSyncStore.getState();
      ws.send(
        envelope("device.telemetry", roomId, {
          kind: "web-receiver",
          roomGroup,
          status: role !== null ? "syncing" : video.paused ? "idle" : "online",
          volume: Math.round(video.volume * 100),
          muted: video.muted,
          audioDelayMs: audioRef.current.getState() === "ready" ? audioRef.current.getDelayMs() : delayMs,
          measuredRttMs: probe.rttMs,
          driftMs: role === "follower" ? probe.driftMs : null,
          audioChain: audioRef.current.getState(),
        })
      );
    }, 2000);
    return () => clearInterval(timer);
  }, [roomId, roomGroup, delayMs, role, ws.selfId, ws.send]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const action = REMOTE_KEYS[ev.key];
      if (!action) return;
      ev.preventDefault();
      doAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role]);

  function applyCtl(p: { action: string; value?: number; valueMs?: number }, video: HTMLVideoElement) {
    const chain = audioRef.current;
    switch (p.action) {
      case "play":
        void video.play().catch(() => undefined);
        break;
      case "pause":
        video.pause();
        break;
      case "seekBack":
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case "seekFwd":
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        break;
      case "volUp":
        video.volume = Math.min(1, video.volume + 0.1);
        break;
      case "volDown":
        video.volume = Math.max(0, video.volume - 0.1);
        break;
      case "mute":
        video.muted = !video.muted;
        break;
      case "volume":
        if (typeof p.value === "number") video.volume = Math.max(0, Math.min(1, p.value / 100));
        break;
      case "delay":
        if (typeof p.valueMs === "number") {
          setDelayMs(p.valueMs);
          localStorage.setItem("aurelia-delay-ms", String(p.valueMs));
          if (!chain.setDelayMs(p.valueMs)) {
            toast("Audio graph unavailable — delay not applied (CORS/suspended)", "warn");
          }
        }
        break;
      case "info":
        showOsd();
        break;
      case "back":
        video.pause();
        break;
      case "home":
        hlsRef.current?.destroy();
        hlsRef.current = null;
        video.removeAttribute("src");
        video.load();
        setSession(null);
        setGate(false);
        break;
    }
  }

  function doAction(action: RemoteAction) {
    const video = videoRef.current;
    if (!video) return;
    applyCtl({ action }, video);
    if (role === "host") {
      ws.send(envelope("ctl", roomId, { action }));
    }
    showOsd();
  }

  function updateDelay(ms: number) {
    setDelayMs(ms);
    localStorage.setItem("aurelia-delay-ms", String(ms));
    const applied = audioRef.current.setDelayMs(ms);
    if (!applied && audioRef.current.getState() === "unavailable") {
      toast("Audio graph unavailable — delay not applied", "warn");
    }
  }

  const currentStatus =
    role === null
      ? "pending"
      : syncStatus(role === "follower" ? syncStore.driftMs : null, syncStore.peerCount > 0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex gap-5">
        <div
          className="panel relative aspect-video w-full max-w-[860px] overflow-hidden bg-black"
          onMouseMove={showOsd}
          onClick={showOsd}
        >
          <video
            ref={videoRef}
            playsInline
            className="h-full w-full"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setMeta((m) => ({ ...m, res: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : "—" }));
              if (session && session.resumeSec > 0 && role === null) {
                v.currentTime = session.resumeSec;
              }
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              const buffered = v.buffered.length > 0 ? v.buffered.end(v.buffered.length - 1) : 0;
              setMeta((m) => ({
                ...m,
                buffered: v.duration ? Math.min(100, (buffered / v.duration) * 100) : 0,
              }));
              if (Date.now() - lastProgressSave.current > 5000 && !v.paused) {
                lastProgressSave.current = Date.now();
                saveProgress(v.currentTime, v.duration || 0);
                captureThumbnail();
              }
            }}
            onPlaying={() => {
              setTimeout(captureThumbnail, 1500);
            }}
          />

          {gate && session && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
              <div className="font-mono text-[11px] tracking-[0.3em] text-gold-dim">AURELIA CAST</div>
              <button
                onClick={() => void beginPlayback()}
                className="group relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-gold bg-obsidian text-3xl text-gold shadow-[0_0_30px_rgba(212,175,55,0.25)] hover:scale-105 active:scale-95"
              >
                ▶
              </button>
              <div className="text-center">
                <div className="font-display text-[15px] font-medium text-ink">Press to Start Audio</div>
                <div className="mt-1 text-[12px] text-ink-dim">
                  {session.title} · {session.format.toUpperCase()}
                </div>
              </div>
            </div>
          )}

          {!session && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
              <div className="font-mono text-[11px] tracking-[0.3em] text-gold-dim">NO SIGNAL</div>
              <div className="text-[12px] text-ink-dim">Cast a stream from the Cast Sender or POST /api/cast</div>
              <div className="skeleton mt-3 h-1 w-64 rounded-full" />
            </div>
          )}

          <div
            className={`osd-scrim pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 pb-3 transition-opacity duration-200 ${
              osdVisible && session ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-display text-[15px] font-semibold text-ink">{session?.title}</div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-dim">
                  {session?.format.toUpperCase()} · {meta.res} · {meta.bitrate}
                </div>
              </div>
              <div className="text-right font-mono text-[11px]">
                <div className="text-gold">Δ {delayMs} ms</div>
                <div className="text-ink-dim">VOL {Math.round((videoRef.current?.volume ?? 0) * 100)}</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/15">
              <div
                className="h-1.5 rounded-full bg-gold"
                style={{
                  width: `${
                    videoRef.current?.duration
                      ? Math.min(100, ((videoRef.current?.currentTime ?? 0) / videoRef.current.duration) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-dim">
              <span className="tabular-nums">{formatTimecode(videoRef.current?.currentTime ?? 0)}</span>
              <span className="tabular-nums">{formatTimecode(videoRef.current?.duration ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="panel flex w-[248px] shrink-0 flex-col gap-4 p-4">
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.22em] text-ink-dim">ROKU D-PAD</div>
            <RemotePad onAction={(a) => doAction(a)} />
            <div className="mt-3 font-mono text-[10px] leading-relaxed text-ink-dim">
              SPACE play/pause · ←/→ ±10s
              <br />↑/↓ volume · M mute · I info
              <br />
              ESC back · BACKSPACE home
            </div>
          </div>
        </div>
      </div>

      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="flex items-center gap-3">
          <Led status={currentStatus} />
          <span className="font-display text-[13px] font-medium">
            {role === null
              ? "Multi-Room Sync Off"
              : role === "host"
                ? `Hosting · ${syncStore.peerCount} peer(s)`
                : `Follower · ${syncStore.peerCount} peer(s)`}
          </span>
          <button
            className={`rounded-md border px-3 py-1.5 text-[12px] ${
              role === null
                ? "border-gold bg-gold/10 text-gold hover:bg-gold/20"
                : "border-hairline bg-well text-ink-dim hover:text-ink"
            }`}
            onClick={() => toggleSync(role === null)}
          >
            {role === null ? "ENABLE MULTI-ROOM SYNC" : "DISABLE SYNC"}
          </button>
        </div>
        <div className="font-mono text-[11px] text-ink-dim">
          <span className="tabular-nums">RTT {syncStore.rttMs ?? "—"} ms</span>
          <span className="mx-2">·</span>
          <span className="tabular-nums">
            Δclock {syncStore.offsetMs !== null ? `${Math.round(syncStore.offsetMs)} ms` : "—"}
          </span>
          <span className="mx-2">·</span>
          <span className="tabular-nums">
            drift {syncStore.driftMs !== null ? `${Math.round(syncStore.driftMs)} ms` : "—"}
          </span>
          <span className="mx-2">·</span>
          <span>mode {syncStore.mode}</span>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-ink-dim">
            Audio delay
            <input
              type="range"
              min={0}
              max={500}
              step={5}
              value={delayMs}
              disabled={audioState === "unavailable"}
              onChange={(e) => updateDelay(Number(e.target.value))}
              className="w-40 accent-[var(--color-gold)]"
              style={audioState === "unavailable" ? { opacity: 0.4 } : undefined}
            />
            <span className="w-14 font-mono tabular-nums text-gold">{delayMs} ms</span>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-dim">
            Room group
            <select
              value={roomGroup}
              onChange={(e) => {
                setRoomGroup(e.target.value);
                localStorage.setItem("aurelia-room-group", e.target.value);
              }}
              className="text-[12px]"
            >
              {ROOM_GROUPS.map((gname) => (
                <option key={gname}>{gname}</option>
              ))}
            </select>
          </label>
        </div>
        {audioState === "unavailable" && (
          <div className="w-full rounded-md border border-amber-drift/40 bg-well px-3 py-2 text-[12px] text-amber-drift">
            Audio graph unavailable (stream lacks CORS or AudioContext suspended) — delay slider inert,
            direct playback active.
          </div>
        )}
      </div>
    </div>
  );
}
