import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideArrowUpRight,
  LucideCheck,
  LucideCopy,
  LucideFile,
  LucideLink,
  LucideMessageSquare,
  LucideMoreHorizontal,
  LucidePencil,
  LucidePin,
  LucideReply,
  LucideSmile,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { Attachment, Message } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { ClickOutsideDirective } from '../../../shared/directives/click-outside.directive';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { MentionParserPipe } from '../../../shared/pipes/mention-parser.pipe';
import { formatFullDate, formatMessageTime } from '../../../shared/utils/time';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';
import { EmojiPickerComponent } from './emoji-picker.component';

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉', '😂', '👀'];

@Component({
  selector: 'app-message-item',
  imports: [
    UserAvatarComponent,
    EmojiPickerComponent,
    ClickOutsideDirective,
    MentionParserPipe,
    FileSizePipe,
    LucideArrowUpRight,
    LucideCheck,
    LucideCopy,
    LucideFile,
    LucideLink,
    LucideMessageSquare,
    LucideMoreHorizontal,
    LucidePencil,
    LucidePin,
    LucideReply,
    LucideSmile,
    LucideTrash2,
    LucideX,
  ],
  templateUrl: './message-item.component.html',
  styleUrl: './message-item.component.css',
})
export class MessageItemComponent {
  readonly message = input.required<Message>();
  readonly grouped = input(false);
  readonly context = input<'channel' | 'thread' | 'panel'>('channel');
  readonly highlighted = input(false);

  protected readonly state = inject(ChatStateService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly editing = signal(false);
  protected readonly editText = signal('');
  protected readonly menuOpen = signal(false);
  protected readonly reactionOpen = signal(false);
  protected readonly lightbox = signal<Attachment | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly quickReactions = QUICK_REACTIONS;

  protected readonly profile = computed(
    () => this.message().sender ?? this.state.profileById().get(this.message().sender_id) ?? null,
  );
  protected readonly displayName = computed(
    () => this.profile()?.display_name ?? 'Unknown member',
  );
  protected readonly handle = computed(() => this.profile()?.handle ?? '');
  protected readonly isOwn = computed(
    () => this.message().sender_id === this.state.currentUserId(),
  );
  protected readonly canModerate = computed(
    () => this.isOwn() || this.state.canManageWorkspace(),
  );
  protected readonly time = computed(() => formatMessageTime(this.message().created_at));
  protected readonly fullDate = computed(() => formatFullDate(this.message().created_at));
  protected readonly imageAttachments = computed(() =>
    this.message().attachments.filter((attachment) => attachment.type.startsWith('image/')),
  );
  protected readonly fileAttachments = computed(() =>
    this.message().attachments.filter((attachment) => !attachment.type.startsWith('image/')),
  );
  protected readonly mentionsMe = computed(() => {
    const handle = this.state.currentProfile()?.handle;
    if (!handle) return false;
    return new RegExp(`@${handle}(?![a-zA-Z0-9_])`, 'i').test(this.message().content);
  });
  protected readonly reactionSummary = computed(() => this.message().reactions);
  protected readonly currentHandle = computed(() => this.state.currentProfile()?.handle ?? '');

  protected onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const mention = target?.closest('[data-mention]') as HTMLElement | null;
    if (!mention) return;

    const handle = mention.dataset['mention'];
    if (!handle) return;
    const profile = this.state.memberProfiles().find(
      (candidate) => candidate.handle.toLowerCase() === handle.toLowerCase(),
    );
    if (!profile || profile.id === this.state.currentUserId()) return;

    event.preventDefault();
    void this.openDirectMessage(profile.id);
  }

  protected async openDirectMessage(userId: string): Promise<void> {
    const channel = await this.state.startDirectMessage(userId);
    if (!channel) return;
    const workspace = this.state.activeWorkspace();
    if (workspace) void this.router.navigate(['/app', workspace.slug, channel.id]);
  }

  protected react(emoji: string): void {
    void this.state.toggleReaction(this.message(), emoji);
    this.reactionOpen.set(false);
  }

  protected openThread(): void {
    void this.state.openThread(this.message());
  }

  protected startEdit(): void {
    this.editText.set(this.message().content);
    this.editing.set(true);
    this.menuOpen.set(false);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editText.set('');
  }

  protected async saveEdit(): Promise<void> {
    const value = this.editText().trim();
    if (!value) return;
    await this.state.editMessage(this.message().id, value);
    this.editing.set(false);
  }

  protected async deleteMessage(): Promise<void> {
    this.confirmDelete.set(false);
    this.menuOpen.set(false);
    await this.state.deleteMessage(this.message().id);
  }

  protected togglePin(): void {
    void this.state.togglePin(this.message());
    this.menuOpen.set(false);
  }

  protected async copyText(): Promise<void> {
    this.menuOpen.set(false);
    try {
      await navigator.clipboard.writeText(this.message().content);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Could not copy message');
    }
  }

  protected async copyLink(): Promise<void> {
    this.menuOpen.set(false);
    const workspace = this.state.activeWorkspace();
    const channel = this.state.activeChannel();
    if (!workspace || !channel) return;
    const link = `${window.location.origin}/app/${workspace.slug}/${channel.id}#${this.message().id}`;
    try {
      await navigator.clipboard.writeText(link);
      this.toast.success('Message link copied');
    } catch {
      this.toast.error('Could not copy link');
    }
  }

  protected retry(): void {
    void this.state.retryMessage(this.message().id);
  }

  protected openLightbox(attachment: Attachment): void {
    this.lightbox.set(attachment);
  }

  protected closeLightbox(): void {
    this.lightbox.set(null);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
    if (this.menuOpen()) {
      this.reactionOpen.set(false);
      this.confirmDelete.set(false);
    }
  }

  protected toggleReactionPicker(): void {
    this.reactionOpen.update((value) => !value);
    if (this.reactionOpen()) {
      this.menuOpen.set(false);
      this.confirmDelete.set(false);
    }
  }

  protected onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.saveEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  protected onEditInput(event: Event): void {
    this.editText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEditFocus(event: FocusEvent): void {
    const node = event.target as HTMLTextAreaElement;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`;
    node.setSelectionRange(node.value.length, node.value.length);
  }

  protected highlightClass(): string {
    return this.mentionsMe() ? 'message-row--mentioned' : '';
  }

  protected senderRole(): string {
    return this.state.members().find((member) => member.user_id === this.message().sender_id)?.role ?? '';
  }

  protected lastReplyLabel(): string {
    const last = this.message().last_reply_at;
    return last ? `Last reply ${formatRelative(last)}` : 'Open thread';
  }

  protected closeAll(): void {
    this.menuOpen.set(false);
    this.reactionOpen.set(false);
    this.confirmDelete.set(false);
  }

  protected trackAttachment(_index: number, attachment: Attachment): string {
    return attachment.id;
  }
}

function formatRelative(value: string): string {
  const then = new Date(value).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
