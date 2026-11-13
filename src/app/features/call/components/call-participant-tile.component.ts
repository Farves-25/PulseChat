import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  LucideMic,
  LucideMicOff,
  LucidePin,
  LucideScreenShare,
} from '@lucide/angular';
import { CallParticipant } from '../../../core/models';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

@Component({
  selector: 'app-call-participant-tile',
  imports: [
    UserAvatarComponent,
    LucideMic,
    LucideMicOff,
    LucideScreenShare,
    LucidePin,
  ],
  templateUrl: './call-participant-tile.component.html',
  styleUrl: './call-participant-tile.component.css',
})
export class CallParticipantTileComponent {
  readonly participant = input.required<CallParticipant>();
  readonly isSpotlight = input(false);
  readonly isPinned = input(false);
  readonly pin = output<void>();

  private readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly isSpeaking = computed(() => this.participant().isSpeaking);
  protected readonly audioMuted = computed(() => this.participant().audioMuted);
  protected readonly videoMuted = computed(() => this.participant().videoMuted);
  protected readonly screenSharing = computed(() => this.participant().screenSharing);
  protected readonly hasVideoStream = computed(() => {
    const p = this.participant();
    if (p.videoMuted && !p.screenSharing) return false;
    const stream = p.stream;
    if (!stream) return false;
    return stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
  });

  constructor() {
    // Bind media stream to video element when stream or video status changes
    effect(() => {
      const elRef = this.videoElement();
      const p = this.participant();
      const stream = p.stream;

      if (elRef?.nativeElement) {
        const video = elRef.nativeElement;
        if (stream && (!p.videoMuted || p.screenSharing)) {
          if (video.srcObject !== stream) {
            video.srcObject = stream;
          }
          video.play().catch(() => {
            // Autoplay policy or aborted
          });
        } else {
          video.srcObject = null;
        }
      }
    });
  }
}
