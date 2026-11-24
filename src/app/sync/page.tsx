"use client";

import { Rail, TopBar, Led } from "@/components/Chrome";
import { useSyncStore, useDeviceStore } from "@/stores/deviceStore";

export default function SyncPage() {
  const sync = useSyncStore();
  const devices = useDeviceStore((s) => s.devices);
  const active = Object.values(devices).filter((d) => d.status === "syncing");

  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex flex-1 flex-col">
        <TopBar
          primaryAction={
            <span className="font-mono text-[11px] text-ink-dim">
              mode {sync.mode} · peers {sync.peerCount}
            </span>
          }
        />
        <main className="flex flex-1 flex-col gap-5 p-5">
          <div className="grid w-full max-w-[860px] grid-cols-4 gap-3">
            {[
              { label: "CLOCK OFFSET", value: sync.offsetMs !== null ? `${Math.round(sync.offsetMs)}` : "—", unit: "ms" },
              { label: "PROBE RTT", value: sync.rttMs !== null ? `${Math.round(sync.rttMs)}` : "—", unit: "ms" },
              { label: "WORST DRIFT", value: sync.driftMs !== null ? `${Math.round(sync.driftMs)}` : "—", unit: "ms" },
              { label: "PEERS", value: `${sync.peerCount}`, unit: "" },
            ].map((card) => (
              <div key={card.label} className="well p-4">
                <div className="font-mono text-[9px] tracking-[0.22em] text-ink-dim">{card.label}</div>
                <div className="mt-1 font-mono text-[22px] tabular-nums text-gold">{card.value}</div>
                <div className="font-mono text-[9px] text-ink-dim">{card.unit}</div>
              </div>
            ))}
          </div>

          <section className="panel w-full max-w-[860px] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Led status="nominal" />
              <h2 className="font-display text-[14px] font-semibold">Sync Engine</h2>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-dim">
              Host publishes 2 Hz sync frames (play/pause/seek/hostTime/mediaTime). Each follower opens a{" "}
              <span className="font-mono text-gold">RTCDataChannel(aurelia-sync)</span>, samples RTT once per
              second, and computes NTP-style offset{" "}
              <span className="font-mono">host − (t0+t1)/2</span>. Drift above 120 ms hard-seeks; 20–120 ms
              nudges playback rate (±4%) until nominal. If P2P is blocked, followers degrade gracefully to WS
              relay probes (control frames only, no media relay).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11px] text-ink-dim">
              <div>
                STUN:{" "}
                <span className="text-gold">
                  {process.env.NEXT_PUBLIC_ENABLE_STUN === "true" ? "enabled (public)" : "off (host candidates only)"}
                </span>
              </div>
              <div>
                Transport: <span className="text-gold">{sync.mode === "off" ? "inactive" : sync.mode}</span>
              </div>
            </div>
          </section>

          <section className="panel w-full max-w-[860px] p-5">
            <h2 className="mb-3 font-display text-[14px] font-semibold">Syncing Nodes</h2>
            {active.length === 0 ? (
              <div className="font-mono text-[11px] text-ink-dim">
                No nodes in a sync session. Enable Multi-Room Sync on a Receiver Studio to form a session.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="text-ink-dim">
                  <tr>
                    <th className="py-1.5">NODE</th>
                    <th>GROUP</th>
                    <th>RTT</th>
                    <th>DRIFT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => (
                    <tr key={d.id} className="border-t border-hairline/60">
                      <td className="py-2 text-ink">{d.name}</td>
                      <td>{d.roomGroup}</td>
                      <td className="tabular-nums">{d.measuredRttMs ?? "—"} ms</td>
                      <td className="tabular-nums">{d.driftMs !== null ? `${Math.round(d.driftMs)} ms` : "—"}</td>
                      <td>
                        <Led status={d.status === "syncing" ? "nominal" : d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
