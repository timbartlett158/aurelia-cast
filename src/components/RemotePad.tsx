"use client";

export type RemoteAction =
  | "play"
  | "pause"
  | "seekBack"
  | "seekFwd"
  | "volUp"
  | "volDown"
  | "mute"
  | "info"
  | "back"
  | "home";

export const REMOTE_KEYS: Record<string, RemoteAction> = {
  " ": "play",
  ArrowLeft: "seekBack",
  ArrowRight: "seekFwd",
  ArrowUp: "volUp",
  ArrowDown: "volDown",
  m: "mute",
  M: "mute",
  i: "info",
  I: "info",
  Escape: "back",
  Backspace: "home",
};

const dPadBtn =
  "flex h-10 w-10 items-center justify-center rounded-md border border-hairline bg-well text-[15px] text-ink hover:border-gold hover:text-gold active:scale-95 active:bg-obsidian";

export function RemotePad({
  onAction,
  compact = false,
}: {
  onAction: (action: RemoteAction, extra?: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 ${compact ? "scale-90" : ""}`}>
      <div className="grid grid-cols-3 gap-1.5">
        <span />
        <button className={dPadBtn} onClick={() => onAction("seekBack")} title="Rewind 10s (←)">
          ⏪
        </button>
        <span />
        <button className={dPadBtn} onClick={() => onAction("volDown")} title="Volume down (↓)">
          −
        </button>
        <button className={dPadBtn} onClick={() => onAction("play")} title="Play (Space)">
          ▶
        </button>
        <button className={dPadBtn} onClick={() => onAction("volUp")} title="Volume up (↑)">
          +
        </button>
        <span />
        <button className={dPadBtn} onClick={() => onAction("seekFwd")} title="Fast-forward 10s (→)">
          ⏩
        </button>
        <span />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <button className={dPadBtn} onClick={() => onAction("pause")} title="Pause (Space)">
          ⏸
        </button>
        <button className={dPadBtn} onClick={() => onAction("mute")} title="Mute (M)">
          ∅
        </button>
        <button className={dPadBtn} onClick={() => onAction("info")} title="Info / OSD (I)">
          i
        </button>
        <button className={dPadBtn} onClick={() => onAction("back")} title="Back (Esc)">
          ⎋
        </button>
      </div>
      <button
        className="mt-1 w-full rounded-md border border-hairline bg-well px-2 py-1.5 text-[11px] tracking-[0.18em] text-ink-dim hover:border-gold hover:text-gold"
        onClick={() => onAction("home")}
      >
        HOME
      </button>
    </div>
  );
}
