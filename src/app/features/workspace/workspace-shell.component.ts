import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideArrowRight,
  LucideHash,
  LucideLoaderCircle,
  LucideMessageSquare,
  LucidePlus,
  LucideSparkles,
  LucideUsers,
  LucideZap,
} from '@lucide/angular';
import { Channel, Workspace } from '../../core/models';
import { ChatStateService } from '../../core/services/chat-state.service';
import { LogoMarkComponent } from '../../shared/components/logo-mark.component';
import { ChannelSidebarComponent } from './components/channel-sidebar.component';
import { ChatHeaderComponent } from './components/chat-header.component';
import { CommandPaletteComponent } from './components/command-palette.component';
import { CreateChannelDialogComponent } from './components/create-channel-dialog.component';
import { CreateWorkspaceDialogComponent } from './components/create-workspace-dialog.component';
import { MessageComposerComponent } from './components/message-composer.component';
import { MessageListComponent } from './components/message-list.component';
import { ProfileSettingsComponent } from './components/profile-settings.component';
import { SidePanelComponent } from './components/side-panel.component';
import { ThreadDrawerComponent } from './components/thread-drawer.component';
import { WorkspaceRailComponent } from './components/workspace-rail.component';

@Component({
  selector: 'app-workspace-shell',
  imports: [
    LogoMarkComponent,
    WorkspaceRailComponent,
    ChannelSidebarComponent,
    ChatHeaderComponent,
    MessageListComponent,
    MessageComposerComponent,
    ThreadDrawerComponent,
    SidePanelComponent,
    CommandPaletteComponent,
    CreateChannelDialogComponent,
    CreateWorkspaceDialogComponent,
    ProfileSettingsComponent,
    LucideArrowRight,
    LucideHash,
    LucideLoaderCircle,
    LucideMessageSquare,
    LucidePlus,
    LucideSparkles,
    LucideUsers,
    LucideZap,
  ],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.css',
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
})
export class WorkspaceShellComponent {
  protected readonly state = inject(ChatStateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mobileSidebar = signal(false);
  protected readonly commandOpen = signal(false);
  protected readonly createChannelOpen = signal(false);
  protected readonly createWorkspaceOpen = signal(false);
  protected readonly profileOpen = signal(false);

  private readonly urlSyncEnabled = signal(false);
  private readonly currentPath = signal(this.cleanPath(this.router.url));

  protected readonly composerPlaceholder = computed(() => {
    const channel = this.state.activeChannel();
    if (!channel) return 'Message';
    return channel.is_dm
      ? `Message ${this.state.activeChannelName()}`
      : `Message #${channel.name}`;
  });

  protected readonly showWorkspaceLoading = computed(
    () =>
      (!this.state.bootstrapped() || this.state.workspaceLoading()) &&
      this.state.activeChannel() === null,
  );

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        void this.syncRoute(
          params.get('workspaceSlug'),
          params.get('channelId'),
        );
      });

    effect(() => {
      const workspace = this.state.activeWorkspace();
      const channel = this.state.activeChannel();
      if (!this.urlSyncEnabled() || !workspace) return;

      const desired = channel
        ? `/app/${workspace.slug}/${channel.id}`
        : `/app/${workspace.slug}`;

      if (this.currentPath() !== desired) {
        untracked(() => {
          this.currentPath.set(desired);
          void this.router.navigate(desired.split('/').slice(1), { replaceUrl: true });
        });
      }
    });
  }

  protected selectChannel(channel: Channel): void {
    this.mobileSidebar.set(false);
    if (this.state.activeChannel()?.id === channel.id) return;
    const workspace = this.state.activeWorkspace();
    if (!workspace) return;
    void this.router.navigate(['/app', workspace.slug, channel.id]);
  }

  protected async onWorkspaceCreated(workspace: Workspace): Promise<void> {
    this.createWorkspaceOpen.set(false);
    await this.router.navigate(['/app', workspace.slug]);
  }

  protected onChannelCreated(): void {
    this.createChannelOpen.set(false);
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (modifier && key === 'k') {
      event.preventDefault();
      if (event.shiftKey) {
        void this.state.openPanel('search');
      } else {
        this.commandOpen.update((open) => !open);
      }
      return;
    }

    if (modifier && event.shiftKey && key === 'n') {
      event.preventDefault();
      this.createChannelOpen.set(true);
      return;
    }

    if (modifier && event.shiftKey && key === 'm') {
      event.preventDefault();
      void this.state.openPanel('members');
      return;
    }

    if (event.key === 'Escape') {
      if (this.commandOpen() || this.profileOpen() || this.createChannelOpen() || this.createWorkspaceOpen()) {
        return;
      }
      if (this.mobileSidebar()) {
        this.mobileSidebar.set(false);
        return;
      }
      if (this.state.hasThread()) {
        this.state.closeThread();
        return;
      }
      if (this.state.panel()) this.state.closePanel();
    }
  }

  protected closeOverlays(): void {
    this.commandOpen.set(false);
    this.profileOpen.set(false);
  }

  private async syncRoute(
    slug: string | null,
    channelId: string | null,
  ): Promise<void> {
    this.currentPath.set(this.cleanPath(this.router.url));

    if (!this.state.bootstrapped()) {
      await this.state.bootstrap(slug, channelId);
      this.urlSyncEnabled.set(true);
      const workspace = this.state.activeWorkspace();
      if (!workspace) return;
      const channel = this.state.activeChannel();
      const desired = channel
        ? `/app/${workspace.slug}/${channel.id}`
        : `/app/${workspace.slug}`;
      if (this.cleanPath(this.router.url) !== desired) {
        this.currentPath.set(desired);
        await this.router.navigate(desired.split('/').slice(1), { replaceUrl: true });
      }
      return;
    }

    this.urlSyncEnabled.set(true);
    this.mobileSidebar.set(false);

    const workspace = this.state.activeWorkspace();
    if (!workspace) return;

    if (slug && slug !== workspace.slug) {
      const target = this.state
        .workspaces()
        .find((candidate) => candidate.slug === slug);
      if (target) await this.state.switchWorkspace(target.id);
    }

    if (channelId) {
      const active = this.state.activeChannel();
      if (active?.id !== channelId) await this.state.openChannel(channelId);
    }
  }

  private cleanPath(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
