import { describe, expect, it } from "vitest";
import {
  computeClockOffset,
  sampleRtt,
  ema,
  reconcile,
  syncStatus,
  targetMediaSec,
  formatTimecode,
  SEEK_THRESHOLD_MS,
  RATE_THRESHOLD_MS,
} from "../sync";

describe("computeClockOffset", () => {
  it("returns host - midpoint with symmetric latency", () => {
    expect(computeClockOffset({ t0: 1000, t1: 1100, hostStamp: 2050 })).toBe(1000);
  });

  it("is negative when follower clock runs ahead", () => {
    const off = computeClockOffset({ t0: 1000, t1: 1100, hostStamp: 1040 });
    expect(off).toBe(-10);
  });

  it("rtt equals t1 - t0", () => {
    expect(sampleRtt({ t0: 500, t1: 640, hostStamp: 0 })).toBe(140);
  });
});

describe("ema", () => {
  it("returns sample when prev is null", () => {
    expect(ema(null, 42)).toBe(42);
  });
  it("moves a fraction alpha toward the sample", () => {
    expect(ema(100, 200, 0.3)).toBeCloseTo(130);
  });
});

describe("reconcile", () => {
  it("holds when within rate threshold", () => {
    expect(reconcile(50.01, 50.02)).toEqual({ action: "hold" });
  });
  it("nudges rate inside seek threshold beyond rate threshold", () => {
    const r = reconcile(50, 50 + RATE_THRESHOLD_MS / 1000 - 0.001 * 0 + 0.05);
    expect(r.action).toBe("rate");
    if (r.action === "rate") {
      expect(r.rate).toBeGreaterThan(0.9);
      expect(r.rate).toBeLessThan(1.1);
    }
  });
  it("seeks beyond the seek threshold", () => {
    expect(reconcile(50, 50.2)).toEqual({ action: "seek" });
    expect(reconcile(50, 49.8)).toEqual({ action: "seek" });
  });
  it("clamps rate nudge at ±4%", () => {
    const r = reconcile(50, 50 + SEEK_THRESHOLD_MS / 1000 - 0.001);
    if (r.action === "rate") expect(Math.abs(1 - r.rate)).toBeLessThanOrEqual(0.0400000001);
  });
});

describe("syncStatus", () => {
  it("pending without peer or sample", () => {
    expect(syncStatus(null, false)).toBe("pending");
    expect(syncStatus(null, true)).toBe("pending");
  });
  it("nominal within 20ms, nudging within 120ms, recovering beyond", () => {
    expect(syncStatus(5, true)).toBe("nominal");
    expect(syncStatus(80, true)).toBe("nudging");
    expect(syncStatus(500, true)).toBe("recovering");
  });
});

describe("targetMediaSec", () => {
  it("extrapolates host media clock with measured offset", () => {
    const frame = { mediaTimeMs: 10000, hostTimeMs: 100000, isPlaying: true };
    const target = targetMediaSec(frame, 101000, 50);
    expect(target).toBeCloseTo(11.05);
  });
});

describe("formatTimecode", () => {
  it("formats mm:ss with padding", () => {
    expect(formatTimecode(0)).toBe("00:00");
    expect(formatTimecode(65)).toBe("01:05");
    expect(formatTimecode(600)).toBe("10:00");
    expect(formatTimecode(-3)).toBe("00:00");
  });
});
