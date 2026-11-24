"use client";

import { sampleRtt, computeClockOffset, ema, type ClockSample } from "./sync";
import type { Envelope } from "./ws-client";

export type PeerRole = "host" | "follower";

export interface PeerManagerCallbacks {
  send: (msg: Envelope) => void;
  onProbeResult: (offsetMs: number, rttMs: number) => void;
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onModeChange: (mode: "webrtc" | "relay") => void;
}

const DC_LABEL = "aurelia-sync";
const P2P_TIMEOUT_MS = 8000;
const PROBE_INTERVAL_MS = 1000;
const PROBE_TIMEOUT_MS = 3000;

export class PeerManager {
  private role: PeerRole;
  private roomId: string;
  private hostId: string | null = null;
  private selfId: string;
  private send: PeerManagerCallbacks["send"];
  private cbs: PeerManagerCallbacks;
  private pcs = new Map<string, RTCPeerConnection>();
  private dcs = new Map<string, RTCDataChannel>();
  private offsetEma: number | null = null;
  private lastProbeAt = 0;
  private mode: "webrtc" | "relay" = "webrtc";
  private pendingPings = new Map<number, { t0: number }>();
  private seq = 0;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(role: PeerRole, roomId: string, selfId: string, cbs: PeerManagerCallbacks) {
    this.role = role;
    this.roomId = roomId;
    this.selfId = selfId;
    this.cbs = cbs;
    this.send = cbs.send;
  }

  private iceConfig(): RTCConfiguration {
    const cfg: RTCConfiguration = { iceServers: [] };
    if (process.env.NEXT_PUBLIC_ENABLE_STUN === "true") {
      cfg.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    }
    return cfg;
  }

  start(): void {
    if (this.role === "follower") {
      this.send({
        v: 2,
        type: "webrtc.announce",
        roomId: this.roomId,
        ts: Date.now(),
        payload: { followerId: this.selfId },
      });
      setTimeout(() => {
        if (this.dcs.size === 0 && this.pcs.size === 0) {
          this.mode = "relay";
          this.cbs.onModeChange("relay");
          this.startRelayProbes();
        }
      }, P2P_TIMEOUT_MS);
      this.send({
        v: 2,
        type: "sync.ping",
        roomId: this.roomId,
        targetId: this.hostId ?? undefined,
        ts: Date.now(),
        payload: { seq: ++this.seq, t0: Date.now() },
      });
    }
  }

  setHostId(hostId: string): void {
    this.hostId = hostId;
  }

  onWsMessage(msg: Envelope): boolean {
    const p = msg.payload as Record<string, unknown> | undefined;
    if (msg.type === "webrtc.announce" && this.role === "host" && msg.fromId && msg.fromId !== this.selfId) {
      void this.hostOfferTo(msg.fromId);
      return true;
    }
    if (msg.type === "webrtc.sdp" && p) {
      void this.handleSdp(msg.fromId!, p);
      return true;
    }
    if (msg.type === "webrtc.ice" && p && this.pcs.has(msg.fromId!)) {
      void this.pcs.get(msg.fromId!)!.addIceCandidate(p as RTCIceCandidateInit).catch(() => undefined);
      return true;
    }
    if (msg.type === "sync.pong" && p) {
      const seq = p.seq as number;
      const pending = this.pendingPings.get(seq);
      if (pending) {
        this.pendingPings.delete(seq);
        const sample: ClockSample = { t0: pending.t0, t1: Date.now(), hostStamp: p.hostTimeMs as number };
        const rtt = sampleRtt(sample);
        if (rtt <= PROBE_TIMEOUT_MS) {
          this.offsetEma = ema(this.offsetEma, computeClockOffset(sample));
          this.cbs.onProbeResult(this.offsetEma, rtt);
        }
      }
      return true;
    }
    return false;
  }

  onDcMessage(peerId: string, data: string): void {
    let msg: { kind?: string; seq?: number; t0?: number; hostTimeMs?: number };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (this.role === "host" && msg.kind === "ping") {
      this.dcs.get(peerId)?.send(JSON.stringify({ kind: "pong", seq: msg.seq, hostTimeMs: Date.now() }));
      return;
    }
    if (this.role === "follower" && msg.kind === "pong") {
      const pending = this.pendingPings.get(msg.seq!);
      if (pending) {
        this.pendingPings.delete(msg.seq!);
        const sample: ClockSample = { t0: pending.t0, t1: Date.now(), hostStamp: msg.hostTimeMs! };
        const rtt = sampleRtt(sample);
        if (rtt <= PROBE_TIMEOUT_MS) {
          this.offsetEma = ema(this.offsetEma, computeClockOffset(sample));
          this.cbs.onProbeResult(this.offsetEma, rtt);
        }
      }
    }
  }

  private async hostOfferTo(followerId: string): Promise<void> {
    const pc = this.ensurePc(followerId);
    if (pc.localDescription) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({
      v: 2,
      type: "webrtc.sdp",
      roomId: this.roomId,
      targetId: followerId,
      ts: Date.now(),
      payload: { sdpType: "offer", sdp: offer },
    });
  }

  private async handleSdp(fromId: string, p: Record<string, unknown>): Promise<void> {
    if (this.role === "host" && p.sdpType === "offer") {
      const pc = this.ensurePc(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({
        v: 2,
        type: "webrtc.sdp",
        roomId: this.roomId,
        targetId: fromId,
        ts: Date.now(),
        payload: { sdpType: "answer", sdp: answer },
      });
    } else if (this.role === "follower" && p.sdpType === "answer") {
      const pc = this.pcs.get(fromId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
      }
    }
  }

  private ensurePc(peerId: string): RTCPeerConnection {
    let pc = this.pcs.get(peerId);
    if (pc) return pc;
    pc = new RTCPeerConnection(this.iceConfig());
    this.pcs.set(peerId, pc);

    if (this.role === "host") {
      const dc = pc.createDataChannel(DC_LABEL);
      this.bindDc(peerId, dc);
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.send({
          v: 2,
          type: "webrtc.ice",
          roomId: this.roomId,
          targetId: peerId,
          ts: Date.now(),
          payload: ev.candidate.toJSON(),
        });
      }
    };
    pc.ondatachannel = (ev) => this.bindDc(peerId, ev.channel);
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc!.connectionState)) {
        this.cbs.onPeerDisconnected(peerId);
      } else if (pc!.connectionState === "connected") {
        this.cbs.onPeerConnected(peerId);
      }
    };
    return pc;
  }

  private bindDc(peerId: string, dc: RTCDataChannel): void {
    this.dcs.set(peerId, dc);
    dc.onmessage = (ev) => this.onDcMessage(peerId, ev.data as string);
    dc.onopen = () => {
      this.cbs.onPeerConnected(peerId);
      if (this.role === "follower") this.startDcProbes(peerId, dc);
    };
    dc.onclose = () => {
      this.dcs.delete(peerId);
      this.cbs.onPeerDisconnected(peerId);
    };
  }

  private startDcProbes(peerId: string, dc: RTCDataChannel): void {
    const timer = setInterval(() => {
      if (dc.readyState !== "open") return;
      const seq = ++this.seq;
      const t0 = Date.now();
      this.pendingPings.set(seq, { t0 });
      dc.send(JSON.stringify({ kind: "ping", seq, t0 }));
      setTimeout(() => this.pendingPings.delete(seq), PROBE_TIMEOUT_MS);
    }, PROBE_INTERVAL_MS);
    this.timers.push(timer);
  }

  private startRelayProbes(): void {
    const timer = setInterval(() => {
      const seq = ++this.seq;
      const t0 = Date.now();
      this.pendingPings.set(seq, { t0 });
      this.send({
        v: 2,
        type: "sync.ping",
        roomId: this.roomId,
        targetId: this.hostId ?? undefined,
        ts: Date.now(),
        payload: { seq, t0 },
      });
      setTimeout(() => this.pendingPings.delete(seq), PROBE_TIMEOUT_MS);
    }, PROBE_INTERVAL_MS);
    this.timers.push(timer);
  }

  handleRelayPing(fromId: string, p: { seq: number; t0: number }): void {
    if (this.role !== "host") return;
    this.send({
      v: 2,
      type: "sync.pong",
      roomId: this.roomId,
      targetId: fromId,
      ts: Date.now(),
      payload: { seq: p.seq, hostTimeMs: Date.now() },
    });
  }

  getOffsetMs(): number | null {
    return this.offsetEma;
  }

  getMode(): "webrtc" | "relay" {
    return this.mode;
  }

  dispose(): void {
    for (const t of this.timers) clearInterval(t);
    for (const dc of this.dcs.values()) dc.close();
    for (const pc of this.pcs.values()) pc.close();
    this.pcs.clear();
    this.dcs.clear();
  }
}
