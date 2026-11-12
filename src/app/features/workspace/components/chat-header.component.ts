import { Component, computed, inject, output, signal } from '@angular/core';
import {
  LucideBell,
  LucideCopy,
  LucideFileText,
  LucideLock,
  LucideMenu,
  LucideMoreHorizontal,
  LucidePin,
  LucideSearch,
  LucideStar,
  LucideUsers,
} from '@lucide/angular';
import { PanelKind } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { ClickOutsideDirective } from '../../../shared/directives/click-outside.directive';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

@Component({
  selector: 'app-chat-header',
  imports: [
    ClickOutsideDirective,
    UserAvatarComponent,
    LucideBell,
    LucideCopy,
    LucideFileText,
    LucideLock,
    LucideMenu,
    LucideMoreHorizontal,
    LucidePin,
    LucideSearch,
    LucideStar,
    LucideUsers,
  ],
  templateUrl: './chat-header.component.html',
  styleUrl: './chat-header.component.css',
})
export class ChatHeaderComponent {
  readonly toggleSidebar = output<void>();

  protected readonly state = inject(ChatStateService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly editingTopic = signal(false);
  protected readonly topicDraft = signal('');
  protected readonly moreOpen = signal(false);

  protected readonly channel = this.state.activeChannel;
  protected readonly isDm = computed(() => this.channel()?.is_dm ?? false);
  protected readonly dmProfile = computed(() => {
    const channel = this.channel();
    if (!channel?.is_dm) return null;
    const otherId = channel.member_ids.find((id) => id !== this.state.currentUserId());
    return otherId ? (this.state.profileById().get(otherId) ?? null) : null;
  });
  protected readonly starred = computed(() => {
    const id = this.channel()?.id;
    return id ? this.state.starredChannelIds().includes(id) : false;
  });
  protected readonly members = this.state.activeMembers;
  protected readonly memberCount = computed(() => this.members().length);
  protected readonly presence = computed(() => this.dmProfile()?.presence ?? 'offline');

  protected startTopicEdit(): void {
    if (this.isDm() || !this.channel()) return;
    this.topicDraft.set(this.channel()?.topic ?? '');
    this.editingTopic.set(true);
  }

  protected cancelTopicEdit(): void {
    this.editingTopic.set(false);
  }

  protected saveTopic(): void {
    const value = this.topicDraft().trim();
    this.editingTopic.set(false);
    if (value === (this.channel()?.topic ?? '')) return;
    void this.state.updateChannelTopic(value);
  }

  protected onTopicKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTopic();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelTopicEdit();
    }
  }

  protected toggleStar(): void {
    const id = this.channel()?.id;
    if (id) void this.state.toggleStar(id);
  }

  protected openPanel(panel: Exclude<PanelKind, null>): void {
    this.moreOpen.set(false);
    void this.state.openPanel(panel);
  }

  protected async copyLink(): Promise<void> {
    this.moreOpen.set(false);
    const workspace = this.state.activeWorkspace();
    const channel = this.channel();
    if (!workspace || !channel) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/app/${workspace.slug}/${channel.id}`,
      );
      this.toast.success('Channel link copied');
    } catch {
      this.toast.error('Could not copy link');
    }
  }

  protected muteChannel(): void {
    this.moreOpen.set(false);
    this.toast.info('Notifications muted', 'You will only be alerted for mentions.');
  }

  protected viewProfile(): void {
    this.openPanel('members');
  }
}
