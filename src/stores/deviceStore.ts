"use client";

import { create } from "zustand";
import type { OutputDevice, RoomGroup, SyncStatus } from "@/lib/types";

interface DeviceState {
  devices: Record<string, OutputDevice>;
  upsertPresence: (peers: { id: string; name: string }[], selfId: string) => void;
  applyTelemetry: (deviceId: string, telemetry: Partial<OutputDevice>) => void;
  patch: (deviceId: string, patch: Partial<OutputDevice>) => void;
}

const now = () => Date.now();

function blankDevice(id: string, name: string): OutputDevice {
  return {
    id,
    name,
    kind: "web-receiver",
    ipAddress: null,
    roomGroup: "Living Room",
    status: "online",
    volume: 70,
    muted: false,
    audioDelayMs: 0,
    measuredRttMs: null,
    driftMs: null,
    lastSeenAt: now(),
  };
}

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: {},
  upsertPresence: (peers, selfId) =>
    set((state) => {
      const next = { ...state.devices };
      const seen = new Set<string>();
      for (const p of peers) {
        seen.add(p.id);
        next[p.id] = next[p.id]
          ? {
              ...next[p.id],
              name: p.name,
              lastSeenAt: now(),
              status: next[p.id].status === "idle" ? "idle" : "online",
            }
          : blankDevice(p.id, p.name);
      }
      for (const id of Object.keys(next)) {
        if (!seen.has(id) && id !== selfId) next[id] = { ...next[id], status: "offline" };
      }
      return { devices: next };
    }),
  applyTelemetry: (deviceId, telemetry) =>
    set((state) => ({
      devices: {
        ...state.devices,
        [deviceId]: {
          ...(state.devices[deviceId] ?? blankDevice(deviceId, deviceId)),
          ...telemetry,
          id: deviceId,
          lastSeenAt: now(),
        },
      },
    })),
  patch: (deviceId, patch) =>
    set((state) => {
      const existing = state.devices[deviceId];
      if (!existing) return state;
      return { devices: { ...state.devices, [deviceId]: { ...existing, ...patch } } };
    }),
}));

interface SyncState {
  status: SyncStatus;
  offsetMs: number | null;
  rttMs: number | null;
  driftMs: number | null;
  mode: "webrtc" | "relay" | "pending" | "off";
  peerCount: number;
  setProbe: (offsetMs: number, rttMs: number) => void;
  setDrift: (driftMs: number | null) => void;
  setMode: (mode: "webrtc" | "relay" | "pending" | "off") => void;
  setPeers: (n: number) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "pending",
  offsetMs: null,
  rttMs: null,
  driftMs: null,
  mode: "off",
  peerCount: 0,
  setProbe: (offsetMs, rttMs) => set({ offsetMs, rttMs }),
  setDrift: (driftMs) => set({ driftMs }),
  setMode: (mode) => set({ mode }),
  setPeers: (peerCount) => set({ peerCount }),
}));

interface ToastState {
  toasts: { id: number; text: string; tone: "ok" | "warn" | "err" }[];
  push: (text: string, tone?: "ok" | "warn" | "err") => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (text, tone = "ok") =>
    set((state) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
      return { toasts: [...state.toasts, { id, text, tone }] };
    }),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const ROOM_GROUPS: RoomGroup[] = ["Theater", "Living Room", "Kitchen", "Studio"];
