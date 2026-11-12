import {
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideActivity,
  LucideArrowUpRight,
  LucideAtSign,
  LucideFileText,
  LucideHash,
  LucideImage,
  LucideLoaderCircle,
  LucideMessageSquare,
  LucidePin,
  LucideSearch,
  LucideUserPlus,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { Attachment, Message, PanelKind, Profile } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { MentionParserPipe } from '../../../shared/pipes/mention-parser.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

interface FileEntry {
  message: Message;
  attachment: Attachment;
}

const TITLES: Record<Exclude<PanelKind, null>, string> = {
  members: 'Members',
  pins: 'Pinned messages',
  files: 'Shared files',
  activity: 'Activity',
  search: 'Search',
  profile: 'Profile',
};

@Component({
  selector: 'app-side-panel',
  imports: [
    UserAvatarComponent,
    HighlightPipe,
    MentionParserPipe,
    RelativeTimePipe,
    FileSizePipe,
    LucideActivity,
    LucideArrowUpRight,
    LucideAtSign,
    LucideFileText,
    LucideHash,
    LucideImage,
    LucideLoaderCircle,
    LucideMessageSquare,
    LucidePin,
    LucideSearch,
    LucideUserPlus,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.css',
})
export class SidePanelComponent implements OnDestroy {
  protected readonly state = inject(ChatStateService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly kind = this.state.panel;
  protected readonly title = computed(() => {
    const kind = this.kind();
    return kind ? TITLES[kind] : '';
  });
  protected readonly channel = this.state.activeChannel;
  protected readonly currentHandle = computed(
    () => this.state.currentProfile()?.handle ?? '',
  );
  protected readonly channelMembers = this.state.activeMembers;
  protected readonly otherMembers = computed(() => {
    const inChannel = new Set(this.channelMembers().map((profile) => profile.id));
    return this.state.memberProfiles().filter((profile) => !inChannel.has(profile.id));
  });

  protected readonly pins = this.state.pinnedMessages;
  protected readonly files = computed<FileEntry[]>(() =>
    this.state
      .fileMessages()
      .flatMap((message) =>
        message.attachments.map((attachment) => ({ message, attachment })),
      ),
  );
  protected readonly images = computed(() =>
    this.files().filter((entry) => entry.attachment.type.startsWith('image/')),
  );
  protected readonly documents = computed(() =>
    this.files().filter((entry) => !entry.attachment.type.startsWith('image/')),
  );
  protected readonly activity = this.state.activity;
  protected readonly results = this.state.searchResults;
  protected readonly searching = this.state.searching;
  protected readonly query = this.state.searchQuery;

  protected readonly searchDraft = signal('');
  private searchTimer: number | null = null;

  ngOnDestroy(): void {
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
  }

  protected close(): void {
    this.state.closePanel();
  }

  protected memberRole(userId: string): string {
    return this.state.members().find((member) => member.user_id === userId)?.role ?? 'member';
  }

  protected async messageMember(profile: Profile): Promise<void> {
    const channel = await this.state.startDirectMessage(profile.id);
    if (!channel) return;
    this.state.closePanel();
    const workspace = this.state.activeWorkspace();
    if (workspace) void this.router.navigate(['/app', workspace.slug, channel.id]);
  }

  protected async invitePeople(): Promise<void> {
    const workspace = this.state.activeWorkspace();
    if (!workspace) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/app/${workspace.slug}`,
      );
      this.toast.success('Invite link copied', 'Share it with a teammate to bring them in.');
    } catch {
      this.toast.info('Invite teammates', 'Copy the workspace URL from your browser to share it.');
    }
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      void this.state.search(value);
    }, 220);
  }

  protected clearSearch(): void {
    this.searchDraft.set('');
    void this.state.search('');
  }

  protected openChannel(channelId: string): void {
    const workspace = this.state.activeWorkspace();
    if (!workspace) return;
    void this.state.openChannel(channelId);
    this.state.closePanel();
    void this.router.navigate(['/app', workspace.slug, channelId]);
  }

  protected openActivity(activityChannelId: string): void {
    this.openChannel(activityChannelId);
  }

  protected openFile(entry: FileEntry): void {
    void this.openChannel(entry.message.channel_id);
  }

  protected channelLabel(channelId: string): string {
    const channel = this.state.channels().find((candidate) => candidate.id === channelId);
    if (!channel) return 'channel';
    return channel.is_dm ? 'Direct message' : `#${channel.name}`;
  }
}
