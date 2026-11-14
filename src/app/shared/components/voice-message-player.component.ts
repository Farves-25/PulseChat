import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  LucideMic,
  LucidePause,
  LucidePlay,
} from '@lucide/angular';
import { Attachment } from '../../core/models';

@Component({
  selector: 'app-voice-message-player',
  imports: [LucidePlay, LucidePause, LucideMic],
  template: `
    <div
      class="flex w-full max-w-sm items-center gap-3 rounded-2xl border p-2.5 shadow-sm transition"
      [class.bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface-2))]]="isMine()"
      [class.border-[rgba(var(--accent-rgb),0.3)]]="isMine()"
      [class.bg-[var(--surface-2)]]="!isMine()"
      [class.border-default]="!isMine()"
    >
      <!-- Play/Pause Button -->
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-md transition hover:scale-105 active:scale-95"
        style="background: linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 70%, #000))"
        [attr.aria-label]="isPlaying() ? 'Pause voice note' : 'Play voice note'"
        (click)="togglePlay()"
      >
        @if (isPlaying()) {
          <svg lucidePause [size]="18" fill="currentColor"></svg>
        } @else {
          <svg lucidePlay class="ml-0.5" [size]="18" fill="currentColor"></svg>
        }
      </button>

      <!-- Waveform & Progress -->
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          class="group/wave flex h-7 cursor-pointer items-center gap-[3px] py-1"
          role="slider"
          tabindex="0"
          [attr.aria-valuenow]="Math.round(progressPercent())"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Voice message scrubber"
          (click)="seekByClick($event)"
          (keydown.arrowright)="seekRelative(3)"
          (keydown.arrowleft)="seekRelative(-3)"
        >
          @for (bar of waveformBars; track $index) {
            <span
              class="w-[3px] rounded-full transition-all duration-150"
              [style.height.px]="bar"
              [style.background]="
                $index / waveformBars.length <= progressPercent() / 100
                  ? 'var(--accent)'
                  : 'var(--border-strong)'
              "
            ></span>
          }
        </div>

        <div class="flex items-center justify-between text-[0.62rem] font-semibold text-muted">
          <span>{{ formattedCurrentTime() }}</span>
          <div class="flex items-center gap-2">
            <!-- Speed button -->
            <button
              type="button"
              class="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[0.6rem] font-bold text-soft transition hover:bg-accent-soft hover:text-accent"
              title="Playback speed"
              (click)="cycleSpeed()"
            >
              {{ speed() }}x
            </button>
            <span>{{ formattedTotalDuration() }}</span>
          </div>
        </div>
      </div>

      <!-- Mic indicator badge -->
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
        title="Voice note"
      >
        <svg lucideMic [size]="15"></svg>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class VoiceMessagePlayerComponent {
  readonly attachment = input.required<Attachment>();
  readonly isMine = input(false);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly Math = Math;

  protected readonly isPlaying = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly speed = signal<1 | 1.5 | 2>(1);

  // Precomputed waveform bar heights for organic WhatsApp look
  protected readonly waveformBars = [
    8, 14, 18, 12, 22, 16, 26, 20, 14, 24,
    18, 10, 22, 28, 16, 12, 20, 24, 16, 8,
    14, 22, 18, 12, 16, 20, 14, 10,
  ];

  private audio: HTMLAudioElement | null = null;

  protected readonly progressPercent = computed(() => {
    const total = this.duration();
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.max(0, (this.currentTime() / total) * 100));
  });

  protected readonly formattedCurrentTime = computed(() =>
    this.formatTime(this.currentTime()),
  );

  protected readonly formattedTotalDuration = computed(() => {
    const dur = this.duration() || this.attachment().duration || 0;
    return this.formatTime(dur);
  });

  constructor() {
    effect(() => {
      const att = this.attachment();
      if (att.duration) {
        this.duration.set(att.duration);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.cleanupAudio();
    });
  }

  private initAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio(this.attachment().url);
      this.audio.playbackRate = this.speed();

      this.audio.addEventListener('loadedmetadata', () => {
        if (this.audio && this.audio.duration && !isNaN(this.audio.duration) && isFinite(this.audio.duration)) {
          this.duration.set(Math.round(this.audio.duration));
        }
      });

      this.audio.addEventListener('timeupdate', () => {
        if (this.audio) {
          this.currentTime.set(Math.round(this.audio.currentTime));
        }
      });

      this.audio.addEventListener('ended', () => {
        this.isPlaying.set(false);
        this.currentTime.set(0);
        if (this.audio) this.audio.currentTime = 0;
      });

      this.audio.addEventListener('pause', () => {
        this.isPlaying.set(false);
      });

      this.audio.addEventListener('play', () => {
        this.isPlaying.set(true);
      });

      this.audio.addEventListener('error', () => {
        this.isPlaying.set(false);
      });
    }
    return this.audio;
  }

  protected async togglePlay(): Promise<void> {
    const audio = this.initAudio();
    if (this.isPlaying()) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        this.isPlaying.set(false);
      }
    }
  }

  protected seekByClick(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    const targetTime = ratio * (this.duration() || 1);
    this.seekTo(targetTime);
  }

  protected seekRelative(seconds: number): void {
    const target = Math.max(0, Math.min(this.duration(), this.currentTime() + seconds));
    this.seekTo(target);
  }

  private seekTo(targetTime: number): void {
    const audio = this.initAudio();
    audio.currentTime = targetTime;
    this.currentTime.set(Math.round(targetTime));
  }

  protected cycleSpeed(): void {
    const nextSpeed = this.speed() === 1 ? 1.5 : this.speed() === 1.5 ? 2 : 1;
    this.speed.set(nextSpeed as 1 | 1.5 | 2);
    if (this.audio) {
      this.audio.playbackRate = nextSpeed;
    }
  }

  private formatTime(seconds: number): string {
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  private cleanupAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}
