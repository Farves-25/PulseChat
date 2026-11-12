import { Component, computed, input } from '@angular/core';
import { PresenceState, Profile } from '../../core/models';
import { avatarGradient, initialsFor } from '../utils/avatar';

@Component({
  selector: 'app-user-avatar',
  template: `
    <div
      class="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full font-bold text-white select-none"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="gradient()"
      [style.font-size.px]="fontSize()"
      [attr.aria-label]="displayName()"
      [title]="displayName()"
    >
      @if (profile()?.avatar_url) {
        <img
          class="h-full w-full rounded-full object-cover"
          [src]="profile()!.avatar_url"
          [alt]="displayName()"
          loading="lazy"
        />
      } @else {
        <span class="tracking-tight drop-shadow-sm">{{ initials() }}</span>
      }
      @if (showPresence() && presence()) {
        <span class="presence-dot" [class]="'presence-dot presence-' + presence()"></span>
      }
    </div>
  `,
})
export class UserAvatarComponent {
  readonly profile = input<Profile | null | undefined>(null);
  readonly name = input<string>('');
  readonly size = input(34);
  readonly presence = input<PresenceState | null>(null);
  readonly showPresence = input(false);

  readonly displayName = computed(
    () => this.profile()?.display_name ?? this.name() ?? 'Unknown member',
  );
  readonly initials = computed(() => initialsFor(this.displayName()));
  readonly gradient = computed(() => avatarGradient(this.displayName() + (this.profile()?.handle ?? '')));
  readonly fontSize = computed(() => Math.max(9, Math.round(this.size() * 0.36)));
}
