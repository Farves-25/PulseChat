import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import {
  LucideMaximize2,
  LucideMic,
  LucideMicOff,
  LucidePhoneOff,
  LucideVideo,
  LucideVideoOff,
} from '@lucide/angular';
import { CallService } from '../../core/services/call.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';

@Component({
  selector: 'app-call-floating-widget',
  imports: [
    UserAvatarComponent,
    LucideMaximize2,
    LucideMic,
    LucideMicOff,
    LucideVideo,
    LucideVideoOff,
    LucidePhoneOff,
  ],
  templateUrl: './call-floating-widget.component.html',
  styleUrl: './call-floating-widget.component.css',
})
export class CallFloatingWidgetComponent {
  protected readonly call = inject(CallService);

  private readonly miniVideoEl = viewChild<ElementRef<HTMLVideoElement>>('miniVideo');

  protected readonly activeCall = this.call.activeCall;
  protected readonly spotlight = this.call.spotlightParticipant;
  protected readonly isSpeaking = computed(() => this.spotlight()?.isSpeaking ?? false);

  protected readonly formattedDuration = computed(() => {
    const total = this.call.callDuration();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  constructor() {
    effect(() => {
      const elRef = this.miniVideoEl();
      const spot = this.spotlight();
      const stream = spot?.stream;

      if (elRef?.nativeElement) {
        const video = elRef.nativeElement;
        if (stream && (!spot?.videoMuted || spot?.screenSharing)) {
          if (video.srcObject !== stream) {
            video.srcObject = stream;
          }
          video.play().catch(() => {});
        } else {
          video.srcObject = null;
        }
      }
    });
  }
}
