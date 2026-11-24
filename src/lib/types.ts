export type Format = "hls" | "mp4";
export type DeviceKind = "web-receiver" | "roku-lan";
export type DeviceStatus = "online" | "syncing" | "idle" | "offline";
export type RoomGroup = "Theater" | "Living Room" | "Kitchen" | "Studio";

export interface OutputDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  ipAddress: string | null;
  roomGroup: RoomGroup;
  status: DeviceStatus;
  volume: number;
  muted: boolean;
  audioDelayMs: number;
  measuredRttMs: number | null;
  driftMs: number | null;
  lastSeenAt: number;
}

export interface RoomSession {
  roomId: string;
  activeUrl: string | null;
  title: string | null;
  format: Format | null;
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  hostTimestampMs: number;
  updatedBy: string | null;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  format: Format;
  thumbnailUrl: string | null;
  lastPositionSec: number;
  durationSec: number;
  playedAt: number;
  playCount: number;
  isFavorite: boolean;
}

export interface SyncFrame {
  url: string | null;
  isPlaying: boolean;
  mediaTimeMs: number;
  hostTimeMs: number;
  playbackRate: number;
}

export type SyncStatus = "nominal" | "nudging" | "recovering" | "pending";

export interface RokuExportSettings {
  title: string;
  port: number;
  accent: "Gold" | "Obsidian" | "Slate" | "Crimson";
}
