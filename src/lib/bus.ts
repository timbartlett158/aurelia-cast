type BroadcastFn = (roomId: string | null, msg: unknown) => void;
type SseListener = (msg: unknown) => void;

interface PendingEntry {
  roomId: string | null;
  msg: unknown;
}

interface AureliaBusGlobals {
  __aureliaBroadcast?: BroadcastFn;
  __aureliaSseListeners?: Set<SseListener>;
  __aureliaBusQueue?: PendingEntry[];
}

const g = globalThis as unknown as AureliaBusGlobals;
g.__aureliaBusQueue ??= [];
g.__aureliaSseListeners ??= new Set();

export function registerBroadcast(fn: BroadcastFn): void {
  g.__aureliaBroadcast = fn;
  const queue = g.__aureliaBusQueue;
  if (!queue) return;
  while (queue.length > 0) {
    const entry = queue.shift()!;
    fn(entry.roomId, entry.msg);
  }
}

export function addSseListener(fn: SseListener): () => void {
  const listeners = g.__aureliaSseListeners!;
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function dispatchSse(roomId: string | null, msg: unknown): void {
  for (const fn of g.__aureliaSseListeners!) {
    fn({ roomId, msg });
  }
}

export function publish(roomId: string | null, msg: unknown): void {
  if (typeof g.__aureliaBroadcast === "function") {
    g.__aureliaBroadcast(roomId, msg);
    return;
  }
  const queue = g.__aureliaBusQueue;
  if (!queue) return;
  queue.push({ roomId, msg });
  if (queue.length > 256) queue.splice(0, queue.length - 256);
}

export function isWsServerAttached(): boolean {
  return typeof g.__aureliaBroadcast === "function";
}
