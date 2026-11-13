import { Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideActivity,
  LucideArrowRight,
  LucideCommand,
  LucideHash,
  LucideLock,
  LucideMessageSquare,
  LucideMoon,
  LucidePlus,
  LucideSearch,
  LucideSettings,
  LucideSun,
  LucideUserRound,
  LucidePhone,
  LucideVideo,
} from '@lucide/angular';
import { Channel, Profile } from '../../../core/models';
import { CallService } from '../../../core/services/call.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ThemeService } from '../../../core/services/theme.service';
import { FocusOnInitDirective } from '../../../shared/directives/focus-on-init.directive';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

type EntryKind = 'channel' | 'person' | 'action';
type EntryIcon =
  | 'hash'
  | 'lock'
  | 'dm'
  | 'activity'
  | 'create-channel'
  | 'create-workspace'
  | 'settings'
  | 'theme'
  | 'video'
  | 'phone';

interface PaletteEntry {
  id: string;
  kind: EntryKind;
  icon: EntryIcon;
  group: string;
  label: string;
  hint: string;
  channel?: Channel;
  profile?: Profile;
  action?: 'channel' | 'workspace' | 'activity' | 'profile' | 'theme' | 'call-video' | 'call-audio';
}

@Component({
  selector: 'app-command-palette',
  imports: [
    FocusOnInitDirective,
    UserAvatarComponent,
    LucideActivity,
    LucideArrowRight,
    LucideCommand,
    LucideHash,
    LucideLock,
    LucideMessageSquare,
    LucideMoon,
    LucidePlus,
    LucideSearch,
    LucideSettings,
    LucideSun,
    LucideUserRound,
    LucidePhone,
    LucideVideo,
  ],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.css',
})
export class CommandPaletteComponent {
  readonly closed = output<void>();
  readonly createChannel = output<void>();
  readonly createWorkspace = output<void>();
  readonly openProfile = output<void>();

  protected readonly state = inject(ChatStateService);
  protected readonly call = inject(CallService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

  protected readonly entries = computed<PaletteEntry[]>(() => {
    const term = this.query().trim().toLowerCase();
    const matches = (...values: Array<string | null | undefined>) =>
      !term || values.some((value) => value?.toLowerCase().includes(term));

    const channelEntries: PaletteEntry[] = this.state
      .channels()
      .filter((channel) => {
        if (channel.is_dm) {
          const other = channel.member_ids.find((id) => id !== this.state.currentUserId());
          const profile = other ? this.state.profileById().get(other) : undefined;
          return matches(profile?.display_name, profile?.handle, channel.name);
        }
        return matches(channel.name, channel.topic);
      })
      .slice(0, 6)
      .map((channel) => {
        if (channel.is_dm) {
          const other = channel.member_ids.find((id) => id !== this.state.currentUserId());
          const profile = other ? this.state.profileById().get(other) : undefined;
          return {
            id: `channel-${channel.id}`,
            kind: 'channel' as const,
            icon: 'dm' as const,
            group: 'Channels',
            label: profile?.display_name ?? channel.name,
            hint: 'Direct message',
            channel,
            profile,
          };
        }
        return {
          id: `channel-${channel.id}`,
          kind: 'channel' as const,
          icon: channel.is_private ? ('lock' as const) : ('hash' as const),
          group: 'Channels',
          label: channel.name,
          hint: channel.topic ?? (channel.is_private ? 'Private channel' : 'Channel'),
          channel,
        };
      });

    const personEntries: PaletteEntry[] = term
      ? this.state
          .memberProfiles()
          .filter(
            (profile) =>
              profile.id !== this.state.currentUserId() &&
              matches(profile.display_name, profile.handle),
          )
          .slice(0, 5)
          .map((profile) => ({
            id: `person-${profile.id}`,
            kind: 'person' as const,
            icon: 'dm' as const,
            group: 'People',
            label: profile.display_name,
            hint: `@${profile.handle}`,
            profile,
          }))
      : [];

    const actions: PaletteEntry[] = [
      ...(this.state.activeChannel()
        ? [
            {
              id: 'action-video-call',
              kind: 'action' as const,
              icon: 'video' as const,
              group: 'Calls & Huddles',
              label: this.state.activeChannel()?.is_dm
                ? 'Start video call'
                : 'Start channel video huddle',
              hint: `Launch call in ${this.state.activeChannel()?.is_dm ? this.state.activeChannelName() : '#' + (this.state.activeChannel()?.name ?? '')}`,
              action: 'call-video' as const,
            },
            {
              id: 'action-voice-call',
              kind: 'action' as const,
              icon: 'phone' as const,
              group: 'Calls & Huddles',
              label: this.state.activeChannel()?.is_dm
                ? 'Start voice call'
                : 'Start channel voice huddle',
              hint: `Audio call in ${this.state.activeChannel()?.is_dm ? this.state.activeChannelName() : '#' + (this.state.activeChannel()?.name ?? '')}`,
              action: 'call-audio' as const,
            },
          ]
        : []),
      {
        id: 'action-create-channel',
        kind: 'action',
        icon: 'create-channel',
        group: 'Actions',
        label: 'Create a channel',
        hint: 'Start a new conversation space',
        action: 'channel',
      },
      {
        id: 'action-create-workspace',
        kind: 'action',
        icon: 'create-workspace',
        group: 'Actions',
        label: 'Create a workspace',
        hint: 'Bring a new team into PulseChat',
        action: 'workspace',
      },
      {
        id: 'action-activity',
        kind: 'action',
        icon: 'activity',
        group: 'Actions',
        label: 'Open activity',
        hint: 'Mentions and replies for you',
        action: 'activity',
      },
      {
        id: 'action-profile',
        kind: 'action',
        icon: 'settings',
        group: 'Actions',
        label: 'Profile & settings',
        hint: 'Update your name, status, and theme',
        action: 'profile',
      },
      {
        id: 'action-theme',
        kind: 'action',
        icon: 'theme',
        group: 'Actions',
        label: this.theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        hint: 'Toggle the interface theme',
        action: 'theme',
      },
    ].filter((entry) => matches(entry.label, entry.hint)) as PaletteEntry[];

    return [...channelEntries, ...personEntries, ...actions];
  });

  protected readonly grouped = computed(() => {
    const groups: Array<{ name: string; items: PaletteEntry[] }> = [];
    for (const entry of this.entries()) {
      const last = groups.at(-1);
      if (last && last.name === entry.group) last.items.push(entry);
      else groups.push({ name: entry.group, items: [entry] });
    }
    return groups;
  });

  protected readonly active = computed(
    () => this.entries()[Math.min(this.activeIndex(), Math.max(0, this.entries().length - 1))],
  );

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.entries().length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (count) this.activeIndex.update((index) => (index + 1) % count);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) this.activeIndex.update((index) => (index - 1 + count) % count);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = this.active();
      if (entry) void this.run(entry);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  protected isActive(entry: PaletteEntry): boolean {
    return this.active()?.id === entry.id;
  }

  protected indexOf(entry: PaletteEntry): number {
    return this.entries().findIndex((candidate) => candidate.id === entry.id);
  }

  protected hover(index: number): void {
    this.activeIndex.set(index);
  }

  protected async run(entry: PaletteEntry): Promise<void> {
    switch (entry.kind) {
      case 'channel': {
        if (!entry.channel) return;
        const workspace = this.state.activeWorkspace();
        this.close();
        void this.state.openChannel(entry.channel.id);
        if (workspace) {
          void this.router.navigate(['/app', workspace.slug, entry.channel.id]);
        }
        return;
      }
      case 'person': {
        if (!entry.profile) return;
        const channel = await this.state.startDirectMessage(entry.profile.id);
        if (!channel) return;
        this.close();
        const workspace = this.state.activeWorkspace();
        if (workspace) void this.router.navigate(['/app', workspace.slug, channel.id]);
        return;
      }
      case 'action': {
        this.close();
        switch (entry.action) {
          case 'channel':
            this.createChannel.emit();
            return;
          case 'workspace':
            this.createWorkspace.emit();
            return;
          case 'activity':
            void this.state.openPanel('activity');
            return;
          case 'profile':
            this.openProfile.emit();
            return;
          case 'theme':
            this.theme.toggle();
            return;
          case 'call-video': {
            const chan = this.state.activeChannel();
            if (chan) void this.call.startCall(chan, 'video');
            return;
          }
          case 'call-audio': {
            const chan = this.state.activeChannel();
            if (chan) void this.call.startCall(chan, 'audio');
            return;
          }
        }
      }
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
