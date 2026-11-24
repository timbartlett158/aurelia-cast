import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { registerBroadcast, dispatchSse } from "./src/lib/bus.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

interface Conn {
  ws: WebSocket;
  name: string;
  roomId: string | null;
}

interface Envelope {
  v: 2;
  type: string;
  roomId?: string;
  fromId?: string;
  fromName?: string;
  targetId?: string;
  ts: number;
  payload?: unknown;
}

await app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  const wss = new WebSocketServer({ noServer: true });
  const conns = new Map<string, Conn>();
  const rooms = new Map<string, Set<string>>();

  function roomPeers(roomId: string): string[] {
    return [...(rooms.get(roomId) ?? [])];
  }

  function sendTo(id: string, msg: unknown): void {
    const conn = conns.get(id);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  }

  function broadcastRoom(roomId: string | undefined, msg: unknown, exceptId?: string): void {
    if (!roomId) return;
    for (const id of roomPeers(roomId)) {
      if (id !== exceptId) sendTo(id, msg);
    }
  }

  function presenceList(roomId: string): { id: string; name: string }[] {
    return roomPeers(roomId).map((id) => ({ id, name: conns.get(id)?.name ?? id }));
  }

  function leaveAll(id: string): void {
    const conn = conns.get(id);
    if (!conn) return;
    const roomId = conn.roomId;
    if (roomId) {
      rooms.get(roomId)?.delete(id);
      if (rooms.get(roomId)?.size === 0) rooms.delete(roomId);
      conn.roomId = null;
      broadcastRoom(roomId, {
        v: 2,
        type: "presence",
        roomId,
        ts: Date.now(),
        payload: { list: presenceList(roomId) },
      });
    }
  }

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    const id = randomUUID();
    conns.set(id, { ws, name: `Node-${id.slice(0, 4)}`, roomId: null });
    ws.send(JSON.stringify({ v: 2, type: "hello", ts: Date.now(), payload: { id } }));

    ws.on("message", (raw) => {
      let msg: Envelope;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;
      msg.fromId = id;
      msg.fromName = conns.get(id)?.name;
      msg.ts = Date.now();

      if (msg.type === "room.join") {
        const roomId = (msg.payload as { roomId?: string })?.roomId ?? msg.roomId! ?? "studio";
        leaveAll(id);
        conn2join(id, roomId);
        return;
      }
      if (msg.type === "room.leave") {
        leaveAll(id);
        return;
      }
      if (msg.type === "device.rename") {
        const c = conns.get(id);
        if (c && typeof (msg.payload as { name?: string })?.name === "string") {
          c.name = (msg.payload as { name: string }).name;
        }
        return;
      }
      if (msg.type === "webrtc.sdp" || msg.type === "webrtc.ice") {
        if (msg.targetId) sendTo(msg.targetId, msg);
        else broadcastRoom(msg.roomId, msg, id);
        return;
      }
      if (msg.type === "sync.pong") {
        if (msg.targetId) sendTo(msg.targetId, msg);
        return;
      }
      broadcastRoom(msg.roomId, msg, id);
      dispatchSse(msg.roomId ?? null, msg);
    });

    ws.on("close", () => {
      leaveAll(id);
      conns.delete(id);
    });
  });

  function conn2join(id: string, roomId: string): void {
    const c = conns.get(id);
    if (!c) return;
    c.roomId = roomId;
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId)!.add(id);
    broadcastRoom(roomId, {
      v: 2,
      type: "presence",
      roomId,
      ts: Date.now(),
      payload: { list: presenceList(roomId) },
    });
  }

  registerBroadcast((roomId, msg) => {
    if (!roomId) return;
    broadcastRoom(roomId, msg);
    dispatchSse(roomId, msg);
  });

  (globalThis as { __aureliaWsUp?: boolean }).__aureliaWsUp = true;

  server.on("close", () => {
    (globalThis as { __aureliaWsUp?: boolean }).__aureliaWsUp = false;
  });

  server.listen(PORT, HOST, () => {
    console.log(`Aurelia Cast server — http://${HOST}:${PORT}`);
    console.log(`WebSocket signaling — ws://${HOST}:${PORT}/ws (dev: ${dev})`);
  });
});
