import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { HistoryItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "history.jsonl");
const COMPACT_PATH = path.join(DATA_DIR, "history.json");
const COMPACT_EVERY = 200;

interface HistoryStore {
  items: Map<string, HistoryItem>;
  eventsSinceCompact: number;
  queue: Promise<void>;
}

interface StoreGlobals {
  __aureliaHistoryStore?: HistoryStore;
}

const g = globalThis as unknown as StoreGlobals;

function newId(): string {
  return crypto.randomUUID();
}

function sanitizeItem(raw: unknown): HistoryItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)) return null;
  const format = r.format === "hls" ? "hls" : "mp4";
  return {
    id: typeof r.id === "string" && r.id.length > 0 ? r.id : newId(),
    title: typeof r.title === "string" && r.title.length > 0 ? r.title : r.url,
    url: r.url,
    format,
    thumbnailUrl: typeof r.thumbnailUrl === "string" ? r.thumbnailUrl : null,
    lastPositionSec: typeof r.lastPositionSec === "number" && Number.isFinite(r.lastPositionSec) ? Math.max(0, r.lastPositionSec) : 0,
    durationSec: typeof r.durationSec === "number" && Number.isFinite(r.durationSec) ? Math.max(0, r.durationSec) : 0,
    playedAt: typeof r.playedAt === "number" ? r.playedAt : 0,
    playCount: typeof r.playCount === "number" && Number.isInteger(r.playCount) && r.playCount > 0 ? r.playCount : 1,
    isFavorite: r.isFavorite === true,
  };
}

function loadStore(): HistoryStore {
  const store: HistoryStore = { items: new Map(), eventsSinceCompact: 0, queue: Promise.resolve() };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const sources = [COMPACT_PATH, LOG_PATH];
    for (const src of sources) {
      if (!fs.existsSync(src)) continue;
      const text = fs.readFileSync(src, "utf8");
      for (const line of text.split("\n")) {
        if (src === COMPACT_PATH) {
          try {
            const arr = JSON.parse(line || "[]") as unknown[];
            for (const raw of arr) {
              const item = sanitizeItem(raw);
              if (item) store.items.set(item.id, item);
            }
          } catch {
            /* corrupted compaction file is skipped */
          }
          continue;
        }
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line) as unknown;
          if (raw === null) continue;
          if (typeof raw === "object" && "op" in (raw as Record<string, unknown>)) {
            const rec = raw as { op?: string; id?: string };
            if (rec.op === "delete" && typeof rec.id === "string") store.items.delete(rec.id);
            continue;
          }
          const item = sanitizeItem(raw);
          if (item) store.items.set(item.id, item);
        } catch {
          /* skip malformed line */
        }
      }
    }
  } catch {
    /* first boot without storage directory */
  }
  return store;
}

function getStore(): HistoryStore {
  if (!g.__aureliaHistoryStore) g.__aureliaHistoryStore = loadStore();
  return g.__aureliaHistoryStore;
}

function serialize(item: HistoryItem): string {
  return JSON.stringify(item);
}

function appendLine(line: unknown): void {
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(line)}\n`);
}

function compact(store: HistoryStore): void {
  const arr = [...store.items.values()].sort((a, b) => b.playedAt - a.playedAt);
  const tmp = `${COMPACT_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(arr));
  fs.renameSync(tmp, COMPACT_PATH);
  fs.writeFileSync(LOG_PATH, "");
  store.eventsSinceCompact = 0;
}

export function getHistory(): HistoryItem[] {
  return [...getStore().items.values()].sort((a, b) => b.playedAt - a.playedAt);
}

export function getHistoryItem(id: string): HistoryItem | null {
  return getStore().items.get(id) ?? null;
}

export function upsertHistory(input: Partial<HistoryItem> & { url: string }): HistoryItem {
  const store = getStore();
  const existing = [...store.items.values()].find((i) => i.url === input.url && i.id === input.id) ??
    (input.id ? store.items.get(input.id) : undefined) ??
    [...store.items.values()].find((i) => i.url === input.url);

  const item: HistoryItem = {
    id: existing?.id ?? newId(),
    title: input.title ?? existing?.title ?? input.url,
    url: input.url,
    format: input.format ?? existing?.format ?? (input.url.includes(".m3u8") ? "hls" : "mp4"),
    thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
    lastPositionSec: input.lastPositionSec ?? existing?.lastPositionSec ?? 0,
    durationSec: input.durationSec ?? existing?.durationSec ?? 0,
    playedAt: input.playedAt ?? Date.now(),
    playCount: (existing?.playCount ?? 0) + ((existing && !input.playedAt) ? 0 : 1),
    isFavorite: input.isFavorite ?? existing?.isFavorite ?? false,
  };

  store.items.set(item.id, item);
  store.queue = store.queue.then(() => {
    appendLine(item);
    store.eventsSinceCompact += 1;
    if (store.eventsSinceCompact >= COMPACT_EVERY) compact(store);
  });
  return item;
}

export function toggleFavorite(id: string): HistoryItem | null {
  const store = getStore();
  const item = store.items.get(id);
  if (!item) return null;
  item.isFavorite = !item.isFavorite;
  store.queue = store.queue.then(() => {
    appendLine(item);
    store.eventsSinceCompact += 1;
    if (store.eventsSinceCompact >= COMPACT_EVERY) compact(store);
  });
  return item;
}

export function deleteHistory(id: string): boolean {
  const store = getStore();
  const had = store.items.delete(id);
  if (had) {
    store.queue = store.queue.then(() => {
      appendLine({ op: "delete", id });
    });
  }
  return had;
}

export function compactNow(): void {
  const store = getStore();
  compact(store);
}
