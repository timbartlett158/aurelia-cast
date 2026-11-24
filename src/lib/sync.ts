import type { SyncStatus } from "./types";

export interface ClockSample {
  t0: number;
  t1: number;
  hostStamp: number;
}

export function computeClockOffset(s: ClockSample): number {
  const mid = (s.t0 + s.t1) / 2;
  return s.hostStamp - mid;
}

export function sampleRtt(s: ClockSample): number {
  return s.t1 - s.t0;
}

export function ema(prev: number | null, sample: number, alpha = 0.3): number {
  if (prev === null || !Number.isFinite(prev)) return sample;
  return prev + alpha * (sample - prev);
}

export type ReconcileResult =
  | { action: "hold" }
  | { action: "seek" }
  | { action: "rate"; rate: number };

export const SEEK_THRESHOLD_MS = 120;
export const RATE_THRESHOLD_MS = 20;
export const MAX_RATE_NUDGE = 0.04;

export function reconcile(currentSec: number, targetSec: number): ReconcileResult {
  const driftMs = (targetSec - currentSec) * 1000;
  const abs = Math.abs(driftMs);
  if (abs > SEEK_THRESHOLD_MS) return { action: "seek" };
  if (abs > RATE_THRESHOLD_MS) {
    const clamped = Math.max(-MAX_RATE_NUDGE, Math.min(MAX_RATE_NUDGE, driftMs / 2000));
    return { action: "rate", rate: 1 - clamped };
  }
  return { action: "hold" };
}

export function syncStatus(driftMs: number | null, hasPeer: boolean): SyncStatus {
  if (!hasPeer) return "pending";
  if (driftMs === null) return "pending";
  const abs = Math.abs(driftMs);
  if (abs <= RATE_THRESHOLD_MS) return "nominal";
  if (abs <= SEEK_THRESHOLD_MS) return "nudging";
  return "recovering";
}

export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function targetMediaSec(
  frame: { mediaTimeMs: number; hostTimeMs: number; isPlaying: boolean },
  localNowMs: number,
  offsetMs: number
): number {
  return (frame.mediaTimeMs + (localNowMs + offsetMs - frame.hostTimeMs)) / 1000;
}
