"use client";

import { useEffect, useMemo, useState } from "react";
import { Rail, TopBar, Toasts } from "@/components/Chrome";
import { buildRokuPackage } from "@/lib/roku/templates";
import { useToastStore } from "@/stores/deviceStore";
import type { RokuExportSettings } from "@/lib/types";

const DEFAULTS: RokuExportSettings = { title: "Aurelia Cast", port: 8080, accent: "Gold" };

export default function RokuPage() {
  const [settings, setSettings] = useState<RokuExportSettings>(DEFAULTS);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("aurelia-roku-settings");
      if (stored) setSettings(JSON.parse(stored) as RokuExportSettings);
    } catch {
      /* defaults */
    }
  }, []);
  const [activeFile, setActiveFile] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToastStore((s) => s.push);

  const files = useMemo(() => buildRokuPackage(settings), [settings]);

  const update = (patch: Partial<RokuExportSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem("aurelia-roku-settings", JSON.stringify(next));
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/export-roku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = (await res.json()) as { errors?: string[] };
        toast(`Export rejected: ${(data.errors ?? [String(res.status)]).join("; ")}`, "err");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const slug =
        settings.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "aurelia-cast";
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-roku.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`Roku channel package downloaded (${files.length} files)`, "ok");
    } catch {
      toast("Export failed — server unreachable", "err");
    } finally {
      setBusy(false);
    }
  };

  const current = files[Math.min(activeFile, files.length - 1)];

  return (
    <div className="flex min-h-screen">
      <Rail />
      <div className="flex flex-1 flex-col">
        <TopBar
          primaryAction={
            <button
              disabled={busy}
              onClick={() => void download()}
              className="rounded-md border border-gold bg-gold px-4 py-1.5 text-[12px] font-semibold text-obsidian hover:bg-gold/90 disabled:opacity-50"
            >
              {busy ? "PACKAGING…" : "DOWNLOAD CHANNEL .ZIP"}
            </button>
          }
        />
        <main className="flex flex-1 gap-5 p-5">
          <div className="flex w-[300px] shrink-0 flex-col gap-4">
            <section className="panel p-4">
              <h2 className="mb-3 font-display text-[13px] font-semibold">Channel Settings</h2>
              <label className="mb-3 block text-[11px] text-ink-dim">
                Channel title
                <input
                  value={settings.title}
                  maxLength={60}
                  onChange={(e) => update({ title: e.target.value })}
                  className="mt-1 w-full text-[12px]"
                />
              </label>
              <label className="mb-3 block text-[11px] text-ink-dim">
                HTTP receiver port (8080–8099)
                <input
                  type="number"
                  min={8080}
                  max={8099}
                  value={settings.port}
                  onChange={(e) => update({ port: Number(e.target.value) })}
                  className="mt-1 w-full font-mono text-[12px]"
                />
              </label>
              <label className="block text-[11px] text-ink-dim">
                Accent preset
                <select
                  value={settings.accent}
                  onChange={(e) => update({ accent: e.target.value as RokuExportSettings["accent"] })}
                  className="mt-1 w-full text-[12px]"
                >
                  {(["Gold", "Obsidian", "Slate", "Crimson"] as const).map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </section>
            <section className="panel p-4 text-[11px] leading-relaxed text-ink-dim">
              <div className="mb-2 font-mono text-[10px] tracking-[0.22em] text-ink-dim">PACKAGE CONTENTS</div>
              {files.map((f, i) => (
                <button
                  key={f.name}
                  onClick={() => setActiveFile(i)}
                  className={`block w-full truncate rounded px-2 py-1 text-left font-mono text-[10px] ${
                    i === activeFile ? "bg-well text-gold" : "hover:text-ink"
                  }`}
                >
                  {f.name} <span className="text-ink-dim">· {f.content.split("\n").length}L</span>
                </button>
              ))}
              <p className="mt-3 font-mono text-[9px] leading-relaxed">
                BrightScript is structurally validated only — sideload on real hardware per the included
                SIDELoad.md.
              </p>
            </section>
          </div>

          <section className="panel min-w-0 flex-1 p-0">
            <div className="hairline-b flex items-center justify-between px-4 py-2.5">
              <span className="font-mono text-[11px] text-gold">{current.name}</span>
              <span className="font-mono text-[10px] text-ink-dim">{current.content.length} bytes · preview</span>
            </div>
            <pre className="max-h-[640px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-ink">
              {current.content}
            </pre>
          </section>
        </main>
        <Toasts />
      </div>
    </div>
  );
}
