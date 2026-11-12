import { Component, computed, inject, output } from '@angular/core';
import { LucideHash, LucideMessageSquare, LucideX } from '@lucide/angular';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AutoScrollDirective } from '../../../shared/directives/auto-scroll.directive';
import { MessageComposerComponent } from './message-composer.component';
import { MessageItemComponent } from './message-item.component';

@Component({
  selector: 'app-thread-drawer',
  imports: [
    AutoScrollDirective,
    MessageComposerComponent,
    MessageItemComponent,
    RelativeTimePipe,
    LucideHash,
    LucideMessageSquare,
    LucideX,
  ],
  templateUrl: './thread-drawer.component.html',
  styleUrl: './thread-drawer.component.css',
})
export class ThreadDrawerComponent {
  readonly closed = output<void>();

  protected readonly state = inject(ChatStateService);
  protected readonly parent = this.state.threadParent;
  protected readonly replies = this.state.threadReplies;
  protected readonly loading = this.state.threadLoading;
  protected readonly channelName = computed(() =>
    this.state.activeChannel()?.is_dm
      ? this.state.activeChannelName()
      : this.state.activeChannel()?.name ?? '',
  );
  protected readonly replyLabel = computed(() => {
    const count = this.replies().length;
    return `${count} ${count === 1 ? 'reply' : 'replies'}`;
  });

  protected close(): void {
    this.state.closeThread();
    this.closed.emit();
  }
}
