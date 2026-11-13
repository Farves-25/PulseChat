import { Component, computed, inject } from '@angular/core';
import {
  LucidePhone,
  LucidePhoneOff,
  LucideVideo,
} from '@lucide/angular';
import { CallService } from '../../core/services/call.service';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';

@Component({
  selector: 'app-incoming-call-modal',
  imports: [UserAvatarComponent, LucidePhone, LucidePhoneOff, LucideVideo],
  templateUrl: './incoming-call-modal.component.html',
  styleUrl: './incoming-call-modal.component.css',
})
export class IncomingCallModalComponent {
  protected readonly call = inject(CallService);
  protected readonly incoming = this.call.incomingCall;

  protected readonly callerProfile = computed(() => {
    const inc = this.incoming();
    if (!inc) return null;
    return {
      id: inc.initiator.id,
      display_name: inc.initiator.displayName,
      handle: inc.initiator.handle,
      avatar_url: inc.initiator.avatarUrl,
      status_message: null,
      presence: 'online' as const,
    };
  });
}
