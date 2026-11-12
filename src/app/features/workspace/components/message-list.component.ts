import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CdkAutoSizeVirtualScroll } from '@angular/cdk-experimental/scrolling';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import {
  LucideArrowDown,
  LucideHash,
  LucideLock,
  LucideMessageSquare,
  LucideSparkles,
  LucideUsers,
} from '@lucide/angular';
import { Message } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { formatDayDivider, isSameDay, minutesBetween } from '../../../shared/utils/time';
import { MessageItemComponent } from './message-item.component';

type MessageRow =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message; grouped: boolean };

@Component({
  selector: 'app-message-list',
  imports: [
    ScrollingModule,
    CdkAutoSizeVirtualScroll,
    MessageItemComponent,
    LucideArrowDown,
    LucideHash,
    LucideLock,
    LucideMessageSquare,
    LucideSparkles,
    LucideUsers,
  ],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.css',
})
export class MessageListComponent {
  protected readonly state = inject(ChatStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = viewChild(CdkVirtualScrollViewport);

  protected readonly showJump = signal(false);
  private lastChannelId: string | null = null;
  private lastCount = 0;
  private scrollSub: Subscription | null = null;

  protected readonly rows = computed<MessageRow[]>(() => {
    const messages = this.state.messages();
    const rows: MessageRow[] = [];
    let previous: Message | null = null;

    for (const message of messages) {
      if (!previous || !isSameDay(previous.created_at, message.created_at)) {
        rows.push({
          kind: 'divider',
          key: `divider-${message.id}`,
          label: formatDayDivider(message.created_at),
        });
      }

      const grouped =
        previous !== null &&
        previous.sender_id === message.sender_id &&
        isSameDay(previous.created_at, message.created_at) &&
        minutesBetween(previous.created_at, message.created_at) < 5 &&
        !previous.is_pinned &&
        !message.is_pinned;

      rows.push({ kind: 'message', key: message.id, message, grouped });
      previous = message;
    }

    return rows;
  });

  protected readonly channel = this.state.activeChannel;
  protected readonly isDm = computed(() => this.channel()?.is_dm ?? false);
  protected readonly channelLabel = computed(() =>
    this.isDm() ? this.state.activeChannelName() : `#${this.channel()?.name ?? ''}`,
  );
  protected readonly memberCount = computed(() => this.state.activeMembers().length);

  constructor() {
    effect((onCleanup) => {
      const viewport = this.viewport();

      // The viewport only exists once the message branch renders, so the scroll
      // listener is (re)attached whenever the viewport signal becomes available.
      untracked(() => {
        this.scrollSub?.unsubscribe();
        this.scrollSub = null;
        if (!viewport) return;

        this.scrollSub = viewport
          .elementScrolled()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.updateJumpState());
      });

      onCleanup(() => {
        this.scrollSub?.unsubscribe();
        this.scrollSub = null;
      });
    });

    effect(() => {
      const rows = this.rows();
      const channelId = this.state.activeChannel()?.id ?? null;
      const loading = this.state.messagesLoading();

      if (loading || !rows.length) {
        this.lastChannelId = channelId;
        this.lastCount = 0;
        return;
      }

      untracked(() => {
        window.setTimeout(() => this.syncScroll(channelId, rows.length), 60);
      });
    });
  }

  protected trackRow(_index: number, row: MessageRow): string {
    return row.key;
  }

  protected scrollToBottom(): void {
    this.scrollToLatest('smooth');
    this.showJump.set(false);
  }

  protected updateJumpState(): void {
    const viewport = this.viewport();
    if (!viewport) return;
    const distance = viewport.measureScrollOffset('bottom');
    this.showJump.set(distance > 320);
  }

  private scrollToLatest(behavior: ScrollBehavior, retries = behavior === 'auto' ? 3 : 0): void {
    const viewport = this.viewport();
    if (!viewport) return;
    const element = viewport.elementRef.nativeElement;
    element.scrollTo({ top: element.scrollHeight, behavior });

    // Autosize virtual scroll measures rows as they render, so the first
    // measurement can be shorter than the final list. Re-pin while the list is
    // still growing, and stop as soon as the bottom is reached.
    if (retries > 0) {
      window.setTimeout(() => {
        const current = this.viewport();
        if (!current) return;
        const node = current.elementRef.nativeElement;
        const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
        if (distance > 4) this.scrollToLatest('auto', retries - 1);
      }, 180);
    }
  }

  private syncScroll(channelId: string | null, count: number): void {
    const viewport = this.viewport();
    if (!viewport) return;

    if (channelId !== this.lastChannelId) {
      this.lastChannelId = channelId;
      this.lastCount = count;
      this.scrollToLatest('auto');
      this.showJump.set(false);
      return;
    }

    if (count > this.lastCount) {
      const distance = viewport.measureScrollOffset('bottom');
      if (distance < 280 || this.lastCount === 0) {
        this.scrollToLatest('smooth');
        this.showJump.set(false);
      }
    }

    this.lastCount = count;
  }
}
