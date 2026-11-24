"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface Envelope {
  v: 2;
  type: string;
  roomId?: string;
  fromId?: string;
  fromName?: string;
  targetId?: string;
  ts: number;
  payload?: unknown;
}

export function envelope(type: string, roomId: string | undefined, payload: unknown, targetId?: string): Envelope {
  return { v: 2, type, roomId, targetId, ts: Date.now(), payload };
}

export interface WsConnector {
  selfId: string | null;
  connected: boolean;
  send: (msg: Envelope) => void;
}

const MAX_BACKOFF_MS = 5000;

export function useWs(
  roomId: string | undefined,
  name: string,
  onMessage: (msg: Envelope) => void
): WsConnector {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(500);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!roomId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 500;
        setConnected(true);
        ws.send(JSON.stringify(envelope("room.join", roomId, { name })));
      };
      ws.onmessage = (ev) => {
        let msg: Envelope;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.type === "hello") {
          setSelfId((msg.payload as { id: string }).id);
          return;
        }
        onMessageRef.current(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        setSelfId(null);
        if (!disposed) {
          timer = setTimeout(connect, retryRef.current);
          retryRef.current = Math.min(MAX_BACKOFF_MS, retryRef.current * 2);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [roomId, name]);

  const send = useCallback((msg: Envelope) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return { selfId, connected, send };
}
