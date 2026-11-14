import { Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideActivity,
  LucideCheck,
  LucideChevronDown,
  LucideChevronRight,
  LucideHash,
  LucideLock,
  LucideLogOut,
  LucideMoon,
  LucidePlus,
  LucideRadio,
  LucideSearch,
  LucideSettings,
  LucideSun,
  LucideUserPlus,
  LucideMessageSquarePlus,
} from '@lucide/angular';
import { Channel, PresenceState, Profile, Workspace } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { CallService } from '../../../core/services/call.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ToastService } from '../../../core/services/toast.service';
import { ClickOutsideDirective } from '../../../shared/directives/click-outside.directive';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

interface PresenceOption {
  key: PresenceState;
  label: string;
  hint: string;
  color: string;
}

@Component({
  selector: 'app-channel-sidebar',
  imports: [
    ClickOutsideDirective,
    UserAvatarComponent,
    LucideActivity,
    LucideCheck,
    LucideChevronDown,
    LucideChevronRight,
    LucideHash,
    LucideLock,
    LucideLogOut,
    LucideMoon,
    LucidePlus,
    LucideSearch,
    LucideSettings,
    LucideSun,
    LucideUserPlus,
    LucideMessageSquarePlus,
    LucideRadio,
  ],
  templateUrl: './channel-sidebar.component.html',
  styleUrl: './channel-sidebar.component.css',
})
export class ChannelSidebarComponent {
  readonly selectChannel = output<Channel>();
  readonly createChannel = output<void>();
  readonly createWorkspace = output<void>();
  readonly openNewChat = output<void>();
  readonly openProfile = output<void>();
  readonly closeMobile = output<void>();

  protected readonly state = inject(ChatStateService);
  protected readonly auth = inject(AuthService);
  protected readonly call = inject(CallService);
  protected readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly workspaceMenuOpen = signal(false);
  protected readonly channelsCollapsed = signal(false);
  protected readonly dmsCollapsed = signal(false);
  protected readonly presenceOpen = signal(false);

  protected readonly me = this.state.currentProfile;
  protected readonly workspace = this.state.activeWorkspace;
  protected readonly memberCount = computed(() => this.state.members().length);

  protected readonly presenceOptions: PresenceOption[] = [
    { key: 'online', label: 'Active', hint: 'Available to chat', color: 'var(--success)' },
    { key: 'away', label: 'Away', hint: 'Stepping out for a bit', color: 'var(--warning)' },
    { key: 'dnd', label: 'Do not disturb', hint: 'Only mentions break through', color: 'var(--danger)' },
    { key: 'offline', label: 'Invisible', hint: 'Appear offline', color: 'var(--muted-2)' },
  ];

  protected readonly connectionLabel = computed(() => {
    const connection = this.state.connection();
    if (connection === 'demo') return 'Demo workspace';
    if (connection === 'connected') return 'Live · realtime';
    if (connection === 'offline') return 'Reconnecting…';
    return 'Connecting…';
  });

  protected readonly connectionColor = computed(() => {
    const connection = this.state.connection();
    if (connection === 'connected') return 'var(--success)';
    if (connection === 'demo') return 'var(--accent-2)';
    if (connection === 'offline') return 'var(--danger)';
    return 'var(--warning)';
  });

  protected select(channel: Channel): void {
    this.selectChannel.emit(channel);
  }

  protected isActive(channel: Channel): boolean {
    return this.state.activeChannel()?.id === channel.id;
  }

  protected dmProfile(channel: Channel): Profile | null {
    const otherId = channel.member_ids.find((id) => id !== this.state.currentUserId());
    return otherId ? (this.state.profileById().get(otherId) ?? null) : null;
  }

  protected dmName(channel: Channel): string {
    return this.dmProfile(channel)?.display_name ?? this.titleCase(channel.name);
  }

  protected dmPresence(channel: Channel): PresenceState {
    return this.dmProfile(channel)?.presence ?? 'offline';
  }

  protected openSearch(): void {
    void this.state.openPanel('search');
    this.closeMobile.emit();
  }

  protected openActivity(): void {
    void this.state.openPanel('activity');
    this.closeMobile.emit();
  }

  protected openMembers(): void {
    void this.state.openPanel('members');
    this.closeMobile.emit();
  }

  protected newDm(): void {
    this.openNewChat.emit();
    this.closeMobile.emit();
  }

  protected switchWorkspace(workspace: Workspace): void {
    this.workspaceMenuOpen.set(false);
    if (workspace.id === this.state.activeWorkspace()?.id) return;
    this.closeMobile.emit();
    void this.state.switchWorkspace(workspace.id);
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected setPresence(presence: PresenceState): void {
    this.presenceOpen.set(false);
    const current = this.state.currentProfile();
    if (current) {
      this.state.updateProfileSnapshot({ ...current, presence });
    }
    void this.auth.setPresence(presence);
  }

  protected presenceLabel(): string {
    const presence = this.me()?.presence ?? 'online';
    const option = this.presenceOptions.find((candidate) => candidate.key === presence);
    return option?.label ?? 'Active';
  }

  protected presenceColor(): string {
    const presence = this.me()?.presence ?? 'online';
    return (
      this.presenceOptions.find((candidate) => candidate.key === presence)?.color ?? 'var(--success)'
    );
  }

  protected async signOut(): Promise<void> {
    this.presenceOpen.set(false);
    this.state.leave();
    await this.auth.signOut();
    await this.router.navigate(['/auth']);
  }

  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  private titleCase(value: string): string {
    return value
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
