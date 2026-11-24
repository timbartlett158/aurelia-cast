"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useToastStore } from "@/stores/deviceStore";

const NAV = [
  { href: "/", label: "Cast Sender", glyph: "⇪" },
  { href: "/receiver", label: "Receiver Studio", glyph: "▭" },
  { href: "/sync", label: "Multi-Room Sync", glyph: "⇌" },
  { href: "/devices", label: "Output Devices", glyph: "⏻" },
  { href: "/library", label: "Library", glyph: "≡" },
  { href: "/roku", label: "Roku Export", glyph: "▣" },
];

export function Rail() {
  const pathname = usePathname();
  return (
    <nav className="hairline-r flex w-[248px] shrink-0 flex-col gap-1 bg-panel p-4">
      <div className="mb-6">
        <div className="font-display text-[15px] font-semibold tracking-tight text-ink">AURELIA CAST</div>
        <div className="font-mono text-[10px] tracking-[0.22em] text-ink-dim">MULTI-ROOM STUDIO</div>
      </div>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] ${
              active
                ? "bg-well text-gold shadow-[inset_2px_0_0_0_var(--color-gold)]"
                : "text-ink-dim hover:bg-well hover:text-ink"
            }`}
          >
            <span className="w-4 text-center text-[12px]">{item.glyph}</span>
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto font-mono text-[10px] text-ink-dim">
        <div>v2 · LAN receiver</div>
        <div>D4 gesture gate · D2 LAN+STUN</div>
      </div>
    </nav>
  );
}

export function TopBar({ primaryAction }: { primaryAction?: React.ReactNode }) {
  const pathname = usePathname();
  const crumb = NAV.find((n) => n.href === pathname)?.label ?? "Workspace";
  return (
    <header className="hairline-b flex h-12 items-center justify-between bg-panel px-5">
      <div className="font-display text-[13px] font-medium text-ink-dim">{crumb}</div>
      <div className="flex items-center gap-3">{primaryAction}</div>
    </header>
  );
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto cursor-pointer rounded-md border bg-well px-3 py-2 text-[12px] shadow-lg ${
            t.tone === "ok"
              ? "border-emerald-ok/40 text-ink"
              : t.tone === "warn"
                ? "border-amber-drift/40 text-amber-drift"
                : "border-crimson-off/40 text-crimson-off"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Led({ status }: { status: string }) {
  return <span className={`led led-${status}`} aria-label={`status ${status}`} />;
}
