"use client";

export type AudioChainState = "idle" | "ready" | "unavailable";

export class AudioChain {
  private ctx: AudioContext | null = null;
  private src: MediaElementAudioSourceNode | null = null;
  private delay: DelayNode | null = null;
  private gain: GainNode | null = null;
  private state: AudioChainState = "idle";
  private delayMs = 0;

  async probeCors(url: string): Promise<boolean> {
    try {
      await fetch(url, { mode: "cors", headers: { Range: "bytes=0-1" } });
      return true;
    } catch {
      return false;
    }
  }

  getState(): AudioChainState {
    return this.state;
  }

  getDelayMs(): number {
    return this.delayMs;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  attach(video: HTMLVideoElement, url: string): Promise<boolean> {
    if (this.state === "ready" || this.state === "unavailable") return Promise.resolve(this.state === "ready");
    return (async () => {
      const corsOk = await this.probeCors(url);
      if (!corsOk) {
        this.state = "unavailable";
        return false;
      }
      try {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.state = "unavailable";
          return false;
        }
        this.ctx = new Ctor();
        this.src = this.ctx.createMediaElementSource(video);
        this.delay = this.ctx.createDelay(1.0);
        this.delay.delayTime.value = this.delayMs / 1000;
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 1;
        this.src.connect(this.delay).connect(this.gain).connect(this.ctx.destination);
        await this.ctx.resume();
        this.state = "ready";
        return true;
      } catch {
        this.state = "unavailable";
        return false;
      }
    })();
  }

  setDelayMs(ms: number): boolean {
    const clamped = Math.max(0, Math.min(500, ms));
    this.delayMs = clamped;
    if (this.state !== "ready" || !this.delay || !this.ctx) return false;
    this.delay.delayTime.setTargetAtTime(clamped / 1000, this.ctx.currentTime, 0.05);
    return true;
  }

  setVolume(volume: number): boolean {
    if (this.state !== "ready" || !this.gain || !this.ctx) return false;
    this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume / 100)), this.ctx.currentTime, 0.03);
    return true;
  }
}
