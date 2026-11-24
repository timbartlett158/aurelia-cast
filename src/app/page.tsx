"use client";

import { useCallback, useEffect, useState } from "react";
import { Rail, TopBar, Toasts, Led } from "@/components/Chrome";
import { RemotePad, type RemoteAction } from "@/components/RemotePad";
import { CAST_PRESETS } from "@/lib/presets";
import { formatTimecode } from "@/lib/sync";
import { useWs, envelope } from "@/lib/ws-client";
import { useDeviceStore, useToastStore } from "@/stores/deviceStore";
import type { HistoryItem } from "@/lib/types";

export default function CastSenderPage() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState("living-room");
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [casting, setCasting] = useState(false);
  const deviceStore = useDeviceStore();
  const toast = useToastStore((s) => s.push);
  const ws = useWs(roomId, "Cast Sender", (msg) => {
    if (msg.type === "presence") {
      const list = (msg.payload as { list: { id: string; name: string }[] }).list;
      useDeviceStore.getState().upsertPresence(list, "");
    }
  });

  useEffect(() => {
    void fetch("/api/history")
      .then((r) => r.json())
      .then((d: { items: HistoryItem[] }) => setRecent(d.items.slice(0, 8)))
      .catch(() => undefined);
  }, []);

  const cast = useCallback(
    async (targetUrl: string, targetTitle: string) => {
      if (!targetUrl.trim()) {
        toast("Enter a stream URL first", "warn");
        return;
      }
      setCasting(true);
      try {
        const res = await fetch("/api/cast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl.trim(), title: targetTitle.trim() || undefined, roomId }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          toast(`Cast rejected: ${data.error ?? res.status}`, "err");
        } else {
          toast(`Cast sent to room "${roomId}"`, "ok");
        }
      } catch {
        toast("Cast failed — server unreachable", "err");
      } finally {
        setCasting(false);
      }
    },
    [roomId, toast]
  );

  const sendCtl = useCallback(
    (action: string) => {
      if (!ws.connected) {
        toast("Room WS not connected yet", "warn");
        return;
      }
      ws.send(envelope("ctl", roomId, { action }));
    },
    [roomId, ws, toast]
  );

  const onlineCount = Object.values(deviceStore.devices).filter((d) => d.status !== "offline").length;

  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex flex-1 flex-col">
        <TopBar
          primaryAction={
            <span className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
              <Led status={onlineCount > 0 ? "nominal" : "pending"} /> {onlineCount} device(s) in room
            </span>
          }
        />
        <main className="flex flex-1 gap-5 p-5">
          <div className="flex w-full max-w-[720px] flex-col gap-5">
            <section className="panel p-5">
              <h1 className="font-display text-[16px] font-semibold">Quick Cast</h1>
              <p className="mt-1 text-[12px] text-ink-dim">
                Send an HLS (.m3u8) or MP4 URL to a receiver room. Automatic playback happens on every open
                receiver in the room; first playback requires the branded audio-unlock gesture.
              </p>
              <div className="mt-4">
                <div className="mb-2 font-mono text-[10px] tracking-[0.22em] text-ink-dim">STREAM URL</div>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/stream.m3u8"
                    className="flex-1 font-mono text-[12px]"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Program title (optional)"
                    className="flex-1 text-[12px]"
                  />
                  <input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.trim() || "living-room")}
                    placeholder="Room ID"
                    className="w-40 font-mono text-[12px]"
                  />
                  <button
                    disabled={casting}
                    onClick={() => void cast(url, title)}
                    className="rounded-md border border-gold bg-gold px-4 py-2 text-[12px] font-semibold text-obsidian hover:bg-gold/90 disabled:opacity-50"
                  >
                    {casting ? "CASTING…" : "CAST TO RECEIVER"}
                  </button>
                </div>
                <p className="mt-2 font-mono text-[10px] text-ink-dim">
                  Equivalent REST: POST /api/cast {"{"}url, roomId{"}"}
                  {process.env.CAST_TOKEN ? " (x-aurelia-token required)" : ""}
                </p>
              </div>
            </section>

            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-[14px] font-semibold">CORS-Ready Presets</h2>
                <span className="font-mono text-[10px] text-ink-dim">HEAD-verified public test streams</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CAST_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => {
                      setUrl(p.url);
                      void cast(p.url, p.label);
                    }}
                    className="well group px-3 py-3 text-left hover:border-gold"
                  >
                    <div className="font-display text-[13px] font-medium group-hover:text-gold">{p.label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-dim">
                      {p.format.toUpperCase()} · {p.note}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-[14px] font-semibold">Recent — one-click re-cast</h2>
                <a href="/library" className="font-mono text-[10px] text-gold hover:underline">
                  FULL LIBRARY →
                </a>
              </div>
              {recent.length === 0 ? (
                <div className="text-[12px] text-ink-dim">No history yet — cast something.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {recent.map((h) => (
                    <div key={h.id} className="well flex items-center gap-3 px-3 py-2">
                      {h.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.thumbnailUrl} alt="" className="h-8 w-14 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-14 items-center justify-center rounded bg-obsidian font-mono text-[9px] text-gold-dim">
                          {h.format.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px]">{h.title}</div>
                        <div className="font-mono text-[10px] text-ink-dim">
                          {formatTimecode(h.lastPositionSec)} · played ×{h.playCount}
                        </div>
                      </div>
                      <button
                        onClick={() => void cast(h.url, h.title)}
                        className="rounded border border-gold/40 px-2 py-1 text-[10px] text-gold hover:bg-gold/10"
                      >
                        RE-CAST
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="panel w-[220px] shrink-0 self-start p-4">
            <div className="mb-2 font-mono text-[10px] tracking-[0.22em] text-ink-dim">ROOM REMOTE</div>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">
              D-pad taps here are logged as room control payloads. Full transport lives on each Receiver
              Studio window.
            </p>
            <RemotePad
              compact
              onAction={(a: RemoteAction) => {
                sendCtl(a);
                toast(`${a} dispatched to room "${roomId}"`, "ok");
              }}
            />
          </aside>
        </main>
        <Toasts />
      </div>
    </div>
  );
}


