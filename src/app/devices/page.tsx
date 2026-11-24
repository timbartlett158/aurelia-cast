"use client";

import { useEffect, useState } from "react";
import { Rail, TopBar, Toasts, Led } from "@/components/Chrome";
import { ROOM_GROUPS, useDeviceStore, useToastStore } from "@/stores/deviceStore";
import { useWs, envelope } from "@/lib/ws-client";
import type { OutputDevice, RoomGroup } from "@/lib/types";

interface RokuEndpoint {
  id: string;
  name: string;
  ip: string;
  port: number;
}

export default function DevicesPage() {
  const devices = useDeviceStore((s) => s.devices);
  const patch = useDeviceStore((s) => s.patch);
  const toast = useToastStore((s) => s.push);
  const [roomId, setRoomId] = useState("living-room");
  const [rokuEndpoints, setRokuEndpoints] = useState<RokuEndpoint[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("aurelia-roku-endpoints");
      if (stored) setRokuEndpoints(JSON.parse(stored) as RokuEndpoint[]);
    } catch {
      /* defaults */
    }
  }, []);
  const [newRoku, setNewRoku] = useState({ name: "", ip: "" });

  const ws = useWs(roomId, "Device Dashboard", (msg) => {
    if (msg.type === "device.telemetry") {
      useDeviceStore.getState().applyTelemetry(msg.fromId!, msg.payload as never);
    }
  });

  const sendCtl = (targetId: string, payload: object) => {
    ws.send(envelope("ctl", roomId, payload, targetId));
  };

  const saveRoku = (list: RokuEndpoint[]) => {
    setRokuEndpoints(list);
    localStorage.setItem("aurelia-roku-endpoints", JSON.stringify(list));
  };

  const webDevices = Object.values(devices).filter((d: OutputDevice) => d.kind === "web-receiver");

  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex flex-1 flex-col">
        <TopBar
          primaryAction={
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.trim() || "living-room")}
              className="w-40 font-mono text-[11px]"
              placeholder="room"
            />
          }
        />
        <main className="flex flex-1 flex-col gap-5 p-5">
          <section className="panel w-full max-w-[960px] p-5">
            <h1 className="font-display text-[15px] font-semibold">Web Receiver Nodes</h1>
            <p className="mb-4 mt-1 text-[12px] text-ink-dim">
              Live telemetry from receiver nodes broadcasting in room{" "}
              <span className="font-mono text-gold">{roomId}</span>. Delay sliders command the remote Web
              Audio DelayNode (0–500 ms).
            </p>
            {webDevices.length === 0 ? (
              <div className="font-mono text-[11px] text-ink-dim">
                Waiting for telemetry… open /receiver?room={roomId} on a node.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {webDevices.map((d) => (
                  <div key={d.id} className="well flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                    <div className="min-w-[180px]">
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        <Led status={d.status} /> {d.name}
                      </div>
                      <div className="font-mono text-[10px] text-ink-dim">
                        {d.kind} · {d.roomGroup}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-ink-dim">
                      <div className="tabular-nums">RTT {d.measuredRttMs ?? "—"} ms</div>
                      <div className="tabular-nums">
                        drift {d.driftMs !== null ? `${Math.round(d.driftMs)}` : "—"} ms
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-ink-dim">
                      Delay
                      <input
                        type="range"
                        min={0}
                        max={500}
                        step={5}
                        value={d.audioDelayMs}
                        onChange={(e) => {
                          const ms = Number(e.target.value);
                          patch(d.id, { audioDelayMs: ms });
                          sendCtl(d.id, { action: "delay", valueMs: ms });
                        }}
                        className="w-36 accent-[var(--color-gold)]"
                      />
                      <span className="w-12 font-mono tabular-nums text-gold">{d.audioDelayMs} ms</span>
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        className="rounded border border-hairline px-2 py-1 text-[10px] text-ink-dim hover:border-gold hover:text-gold"
                        onClick={() => sendCtl(d.id, { action: "volUp" })}
                      >
                        VOL+
                      </button>
                      <button
                        className="rounded border border-hairline px-2 py-1 text-[10px] text-ink-dim hover:border-gold hover:text-gold"
                        onClick={() => sendCtl(d.id, { action: "volDown" })}
                      >
                        VOL−
                      </button>
                      <button
                        className="rounded border border-hairline px-2 py-1 text-[10px] text-ink-dim hover:border-gold hover:text-gold"
                        onClick={() => sendCtl(d.id, { action: "mute" })}
                      >
                        MUTE
                      </button>
                      <select
                        value={d.roomGroup}
                        onChange={(e) => patch(d.id, { roomGroup: e.target.value as RoomGroup })}
                        className="text-[10px]"
                      >
                        {ROOM_GROUPS.map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel w-full max-w-[960px] p-5">
            <h2 className="font-display text-[15px] font-semibold">Roku LAN Endpoints</h2>
            <p className="mb-4 mt-1 text-[12px] leading-relaxed text-ink-dim">
              Sideloaded Aurelia Cast channels expose their own HTTP receiver. Browsers block direct http://
              LAN calls from https:// pages (mixed content), so casting is done by copying the curl command.
            </p>
            <div className="mb-3 flex gap-2">
              <input
                placeholder="Name"
                value={newRoku.name}
                onChange={(e) => setNewRoku((r) => ({ ...r, name: e.target.value }))}
                className="w-32 text-[12px]"
              />
              <input
                placeholder="IP e.g. 192.168.1.42"
                value={newRoku.ip}
                onChange={(e) => setNewRoku((r) => ({ ...r, ip: e.target.value }))}
                className="w-44 font-mono text-[12px]"
              />
              <button
                onClick={() => {
                  if (!newRoku.name || !/^(\d{1,3}\.){3}\d{1,3}$/.test(newRoku.ip)) {
                    toast("Endpoint needs a name and valid IPv4", "warn");
                    return;
                  }
                  saveRoku([
                    ...rokuEndpoints,
                    { id: Date.now().toString(36), name: newRoku.name, ip: newRoku.ip, port: 8080 },
                  ]);
                  setNewRoku({ name: "", ip: "" });
                  toast("Roku endpoint saved", "ok");
                }}
                className="rounded-md border border-gold bg-gold/10 px-3 py-2 text-[11px] text-gold hover:bg-gold/20"
              >
                ADD ENDPOINT
              </button>
            </div>
            {rokuEndpoints.length === 0 ? (
              <div className="font-mono text-[11px] text-ink-dim">No endpoints saved.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {rokuEndpoints.map((r) => (
                  <div key={r.id} className="well flex items-center gap-3 px-3 py-2">
                    <Led status="pending" />
                    <span className="text-[12px]">{r.name}</span>
                    <span className="font-mono text-[10px] text-ink-dim">
                      {r.ip}:{r.port}
                    </span>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `curl "http://${r.ip}:${r.port}/play?url=<URL>&title=<TITLE>"`
                        );
                        toast("curl command copied (URL placeholder)", "ok");
                      }}
                      className="ml-auto rounded border border-gold/40 px-2 py-1 text-[10px] text-gold hover:bg-gold/10"
                    >
                      COPY CURL
                    </button>
                    <button
                      onClick={() => saveRoku(rokuEndpoints.filter((x) => x.id !== r.id))}
                      className="rounded border border-hairline px-2 py-1 text-[10px] text-crimson-off hover:border-crimson-off"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
        <Toasts />
      </div>
    </div>
  );
}
