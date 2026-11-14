import { Service, signal } from '@angular/core';

export interface RecordedVoiceNote {
  blob: Blob;
  url: string;
  duration: number;
  mimeType: string;
}

@Service()
export class VoiceRecorderService {
  readonly isRecording = signal(false);
  readonly recordingDuration = signal(0);
  readonly audioLevels = signal<number[]>([8, 12, 16, 22, 14, 18, 24, 16, 10, 14, 20, 12]);

  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: number | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  async start(): Promise<void> {
    if (this.isRecording()) return;

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.audioStream, { mimeType })
        : new MediaRecorder(this.audioStream);

      this.audioChunks = [];
      this.startTime = Date.now();
      this.recordingDuration.set(0);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.setupVisualizer(this.audioStream);

      this.mediaRecorder.start(100);
      this.isRecording.set(true);

      this.timerInterval = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.recordingDuration.set(elapsed);
      }, 500);
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<RecordedVoiceNote | null> {
    if (!this.mediaRecorder || !this.isRecording()) {
      this.cleanup();
      return null;
    }

    return new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        this.cleanup();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const duration = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
        const url = URL.createObjectURL(blob);
        this.cleanup();
        resolve({ blob, url, duration, mimeType });
      };

      try {
        recorder.stop();
      } catch {
        this.cleanup();
        resolve(null);
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore errors during cancel
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isRecording.set(false);
    this.recordingDuration.set(0);
    this.audioChunks = [];

    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private getSupportedMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  private setupVisualizer(stream: MediaStream): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!this.isRecording()) return;
        this.analyser?.getByteFrequencyData(dataArray);

        const levels: number[] = [];
        const step = Math.max(1, Math.floor(bufferLength / 12));
        for (let i = 0; i < 12; i++) {
          const val = dataArray[i * step] || 0;
          levels.push(Math.max(6, Math.round((val / 255) * 28)));
        }
        this.audioLevels.set(levels);
        this.animationFrameId = requestAnimationFrame(update);
      };
      update();
    } catch {
      // AudioContext visualizer is best effort
    }
  }
}

