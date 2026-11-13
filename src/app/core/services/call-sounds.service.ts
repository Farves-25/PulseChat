import { Service } from '@angular/core';

@Service()
export class CallSoundsService {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: number | null = null;
  private outgoingInterval: number | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playIncomingRingtone(): void {
    this.stopIncomingRingtone();
    const playPulse = () => {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Pulse 1
      this.playDualTone(ctx, now, 440, 480, 0.4);
      this.playDualTone(ctx, now + 0.45, 440, 480, 0.6);
    };

    playPulse();
    this.ringtoneInterval = window.setInterval(playPulse, 2800);
  }

  stopIncomingRingtone(): void {
    if (this.ringtoneInterval !== null) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  playOutgoingRingtone(): void {
    this.stopOutgoingRingtone();
    const playPulse = () => {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      this.playDualTone(ctx, now, 440, 480, 1.2, 0.08);
    };

    playPulse();
    this.outgoingInterval = window.setInterval(playPulse, 3500);
  }

  stopOutgoingRingtone(): void {
    if (this.outgoingInterval !== null) {
      clearInterval(this.outgoingInterval);
      this.outgoingInterval = null;
    }
  }

  playJoinChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.07;
      this.playSineTone(ctx, start, freq, 0.25, 0.12);
    });
  }

  playLeaveChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [783.99, 587.33, 440.0]; // G5, D5, A4
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.09;
      this.playSineTone(ctx, start, freq, 0.3, 0.1);
    });
  }

  playMuteChime(muted: boolean): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (muted) {
      this.playSineTone(ctx, now, 380, 0.08, 0.08);
      this.playSineTone(ctx, now + 0.07, 300, 0.12, 0.08);
    } else {
      this.playSineTone(ctx, now, 300, 0.08, 0.08);
      this.playSineTone(ctx, now + 0.07, 440, 0.12, 0.08);
    }
  }

  private playDualTone(
    ctx: AudioContext,
    startTime: number,
    freq1: number,
    freq2: number,
    duration: number,
    gainLevel = 0.12,
  ): void {
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq1, startTime);
      osc2.frequency.setValueAtTime(freq2, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.05);
      gain.gain.setValueAtTime(gainLevel, startTime + duration - 0.08);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    } catch {
      // AudioContext unavailable or error
    }
  }

  private playSineTone(
    ctx: AudioContext,
    startTime: number,
    freq: number,
    duration: number,
    gainLevel = 0.1,
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch {
      // AudioContext unavailable or error
    }
  }
}
