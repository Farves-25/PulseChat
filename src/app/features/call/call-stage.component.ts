import {
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  LucideCamera,
  LucideGrid,
  LucideMaximize2,
  LucideMic,
  LucideMicOff,
  LucideMinimize2,
  LucidePhoneOff,
  LucideScreenShare,
  LucideScreenShareOff,
  LucideSparkles,
  LucideUsers,
  LucideVideo,
  LucideVideoOff,
  LucideX,
} from '@lucide/angular';
import { CallLayout, CallParticipant } from '../../core/models';
import { CallService } from '../../core/services/call.service';
import { ToastService } from '../../core/services/toast.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';
import { CallParticipantTileComponent } from './components/call-participant-tile.component';

@Component({
  selector: 'app-call-stage',
  imports: [
    CallParticipantTileComponent,
    UserAvatarComponent,
    LucideMic,
    LucideMicOff,
    LucideVideo,
    LucideVideoOff,
    LucideScreenShare,
    LucideScreenShareOff,
    LucideMaximize2,
    LucideMinimize2,
    LucideGrid,
    LucideUsers,
    LucidePhoneOff,
    LucideX,
    LucideSparkles,
  ],
  templateUrl: './call-stage.component.html',
  styleUrl: './call-stage.component.css',
  host: {
    '(document:keydown)': 'handleGlobalKeydown($event)',
  },
})
export class CallStageComponent {
  protected readonly call = inject(CallService);
  private readonly toast = inject(ToastService);

  protected readonly showParticipantsList = signal(false);
  protected readonly isFullscreen = signal(false);

  protected readonly activeCall = this.call.activeCall;
  protected readonly participants = this.call.participants;
  protected readonly layout = this.call.layout;
  protected readonly isScreenSharing = this.call.isScreenSharing;
  protected readonly spotlight = this.call.spotlightParticipant;

  protected readonly otherParticipants = computed(() => {
    const spot = this.spotlight();
    return this.participants().filter((p) => p.id !== spot?.id);
  });

  protected readonly formattedDuration = computed(() => {
    const total = this.call.callDuration();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  protected readonly gridColumnsClass = computed(() => {
    const count = this.participants().length;
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-4';
  });

  protected handleGlobalKeydown(event: KeyboardEvent): void {
    // Only handle if not typing in an input/textarea
    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.call.toggleMicrophone();
    } else if (event.key === 'v' || event.key === 'V') {
      event.preventDefault();
      void this.call.toggleCamera();
    } else if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      void this.call.toggleScreenShare();
    } else if (event.key === 'Escape') {
      if (this.showParticipantsList()) {
        this.showParticipantsList.set(false);
      }
    }
  }

  protected toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen.set(true);
      }).catch(() => {
        // Fullscreen not allowed
      });
    } else {
      document.exitFullscreen().then(() => {
        this.isFullscreen.set(false);
      }).catch(() => {
        // Exit error
      });
    }
  }

  protected toggleLayout(): void {
    const current = this.layout();
    this.call.setLayout(current === 'grid' ? 'spotlight' : 'grid');
  }

  protected copyInviteLink(): void {
    if (typeof window === 'undefined') return;
    const call = this.activeCall();
    if (!call) return;
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.toast.success('Huddle link copied to clipboard');
    }).catch(() => {
      this.toast.error('Could not copy link');
    });
  }
}
