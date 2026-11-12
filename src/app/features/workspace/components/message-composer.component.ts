import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  LucideAtSign,
  LucideBold,
  LucideCode,
  LucideFile,
  LucideItalic,
  LucideLink,
  LucideList,
  LucideLoaderCircle,
  LucidePaperclip,
  LucideQuote,
  LucideSend,
  LucideSmile,
  LucideX,
} from '@lucide/angular';
import { Attachment, Profile } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { UploadService } from '../../../core/services/upload.service';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';
import { EmojiPickerComponent } from './emoji-picker.component';

@Component({
  selector: 'app-message-composer',
  imports: [
    EmojiPickerComponent,
    UserAvatarComponent,
    FileSizePipe,
    LucideAtSign,
    LucideBold,
    LucideCode,
    LucideFile,
    LucideItalic,
    LucideLink,
    LucideList,
    LucideLoaderCircle,
    LucidePaperclip,
    LucideQuote,
    LucideSend,
    LucideSmile,
    LucideX,
  ],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.css',
})
export class MessageComposerComponent {
  readonly mode = input<'channel' | 'thread'>('channel');
  readonly parentId = input<string | null>(null);
  readonly placeholder = input('Message');
  readonly compact = input(false);

  protected readonly state = inject(ChatStateService);
  private readonly upload = inject(UploadService);
  private readonly toast = inject(ToastService);

  protected readonly text = signal('');
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly uploading = signal(false);
  protected readonly emojiOpen = signal(false);
  protected readonly mentionOpen = signal(false);
  protected readonly mentionQuery = signal('');
  protected readonly mentionIndex = signal(0);
  protected readonly dragging = signal(false);

  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  private currentDraftChannel: string | null = null;
  private mentionStart = -1;

  protected readonly channelId = computed(() => this.state.activeChannel()?.id ?? null);
  protected readonly currentHandle = computed(() => this.state.currentProfile()?.handle ?? '');
  protected readonly canSend = computed(
    () => this.text().trim().length > 0 || this.attachments().length > 0,
  );
  protected readonly mentionResults = computed(() => {
    const term = this.mentionQuery().trim().toLowerCase();
    return this.state
      .memberProfiles()
      .filter((profile) => profile.id !== this.state.currentUserId())
      .filter(
        (profile) =>
          !term ||
          profile.display_name.toLowerCase().includes(term) ||
          profile.handle.toLowerCase().includes(term),
      )
      .slice(0, 6);
  });

  constructor() {
    effect(() => {
      const channelId = this.channelId();
      const mode = this.mode();
      if (mode !== 'channel' || channelId === this.currentDraftChannel) return;
      this.currentDraftChannel = channelId;
      untracked(() => this.loadDraft(channelId));
    });

    afterNextRender(() => {
      if (this.mode() === 'thread') {
        this.textareaRef()?.nativeElement.focus();
      }
      this.resize();
    });
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.text.set(target.value);
    this.resize();
    this.persistDraft(target.value);
    this.state.notifyTyping();
    this.detectMention(target);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.mentionOpen()) {
      const results = this.mentionResults();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionIndex.update((index) => (results.length ? (index + 1) % results.length : 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionIndex.update((index) =>
          results.length ? (index - 1 + results.length) % results.length : 0,
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const target = results[this.mentionIndex()];
        if (target) this.insertMention(target);
        else this.mentionOpen.set(false);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.mentionOpen.set(false);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
      return;
    }

    if (event.key === 'Escape') {
      this.emojiOpen.set(false);
      this.mentionOpen.set(false);
    }
  }

  protected async send(): Promise<void> {
    if (!this.canSend() || this.uploading()) return;

    const content = this.text().trim();
    const attachments = this.attachments();
    const parentId = this.mode() === 'thread' ? this.parentId() : null;
    const channelId = this.channelId();

    this.text.set('');
    this.attachments.set([]);
    this.emojiOpen.set(false);
    this.mentionOpen.set(false);
    this.resize();

    if (this.mode() === 'channel' && channelId) this.state.clearDraft(channelId);

    await this.state.sendMessage({ content, attachments, parentId });
  }

  protected openFilePicker(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = input.files;
    input.value = '';
    await this.processFiles(files);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) await this.processFiles(files);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related && (event.currentTarget as Node).contains(related)) return;
    this.dragging.set(false);
  }

  protected async onPaste(event: ClipboardEvent): Promise<void> {
    const files = event.clipboardData?.files;
    if (files?.length) {
      event.preventDefault();
      await this.processFiles(files);
    }
  }

  protected removeAttachment(id: string): void {
    this.attachments.update((list) => list.filter((attachment) => attachment.id !== id));
  }

  protected toggleEmoji(event: MouseEvent): void {
    event.stopPropagation();
    this.emojiOpen.update((value) => !value);
    if (this.emojiOpen()) this.mentionOpen.set(false);
  }

  protected insertEmoji(emoji: string): void {
    const node = this.textareaRef()?.nativeElement;
    const value = this.text();
    const start = node?.selectionStart ?? value.length;
    const end = node?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    this.text.set(next);
    this.persistDraft(next);
    queueMicrotask(() => {
      const target = this.textareaRef()?.nativeElement;
      if (!target) return;
      target.focus();
      const position = start + emoji.length;
      target.setSelectionRange(position, position);
      this.resize();
    });
  }

  protected insertMention(profile: Profile): void {
    const node = this.textareaRef()?.nativeElement;
    const value = this.text();
    const cursor = node?.selectionStart ?? value.length;
    const start = this.mentionStart >= 0 ? this.mentionStart : cursor;
    const before = value.slice(0, start);
    const after = value.slice(cursor);
    const inserted = `@${profile.handle} `;
    const next = `${before}${inserted}${after}`;

    this.text.set(next);
    this.persistDraft(next);
    this.mentionOpen.set(false);
    this.mentionStart = -1;

    queueMicrotask(() => {
      const target = this.textareaRef()?.nativeElement;
      if (!target) return;
      target.focus();
      const position = before.length + inserted.length;
      target.setSelectionRange(position, position);
      this.resize();
    });
  }

  protected format(prefix: string, suffix = prefix): void {
    const node = this.textareaRef()?.nativeElement;
    if (!node) return;

    const value = this.text();
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;

    this.text.set(next);
    this.persistDraft(next);
    queueMicrotask(() => {
      node.focus();
      node.setSelectionRange(start + prefix.length, end + prefix.length);
      this.resize();
    });
  }

  protected insertLink(): void {
    const node = this.textareaRef()?.nativeElement;
    if (!node) return;
    const value = this.text();
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = value.slice(start, end) || 'link text';
    const next = `${value.slice(0, start)}[${selected}](https://)${value.slice(end)}`;

    this.text.set(next);
    this.persistDraft(next);
    queueMicrotask(() => {
      node.focus();
      const position = start + selected.length + 3;
      node.setSelectionRange(position, position + 'https://'.length);
      this.resize();
    });
  }

  protected insertCodeBlock(): void {
    const node = this.textareaRef()?.nativeElement;
    if (!node) return;
    const value = this.text();
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = value.slice(start, end);
    const block = `\n\`\`\`\n${selected}\n\`\`\`\n`;
    const next = `${value.slice(0, start)}${block}${value.slice(end)}`;
    this.text.set(next);
    this.persistDraft(next);
    queueMicrotask(() => {
      node.focus();
      node.setSelectionRange(start + block.length, start + block.length);
      this.resize();
    });
  }

  protected openMentionPicker(): void {
    const node = this.textareaRef()?.nativeElement;
    if (!node) return;
    const value = this.text();
    const cursor = node.selectionStart ?? value.length;
    this.text.set(`${value.slice(0, cursor)}@${value.slice(cursor)}`);
    this.persistDraft(this.text());
    this.mentionStart = cursor;
    this.mentionQuery.set('');
    this.mentionIndex.set(0);
    this.mentionOpen.set(true);
    queueMicrotask(() => {
      node.focus();
      node.setSelectionRange(cursor + 1, cursor + 1);
      this.resize();
    });
  }

  protected dismissEmoji(): void {
    this.emojiOpen.set(false);
  }

  protected retryUpload(): void {
    this.uploading.set(false);
  }

  private async processFiles(files: FileList | File[]): Promise<void> {
    try {
      const valid = this.upload.validate(files);
      if (valid.length === 0) return;
      this.uploading.set(true);
      for (const file of valid) {
        const attachment = await this.upload.upload(file, this.channelId() ?? 'drafts');
        this.attachments.update((list) => [...list, attachment]);
      }
    } catch (error) {
      this.toast.error(
        'Attachment failed',
        error instanceof Error ? error.message : 'Please try a different file.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  private detectMention(node: HTMLTextAreaElement): void {
    const cursor = node.selectionStart ?? node.value.length;
    const before = node.value.slice(0, cursor);
    const match = /(^|[\s(])@([a-zA-Z0-9_.-]*)$/.exec(before);

    if (!match) {
      this.mentionOpen.set(false);
      this.mentionStart = -1;
      return;
    }

    this.mentionStart = cursor - match[2].length - 1;
    this.mentionQuery.set(match[2]);
    this.mentionIndex.set(0);
    this.mentionOpen.set(true);
    this.emojiOpen.set(false);
  }

  private persistDraft(value: string): void {
    if (this.mode() !== 'channel') return;
    const channelId = this.channelId();
    if (!channelId) return;
    this.state.setDraft(channelId, value);
  }

  private loadDraft(channelId: string | null): void {
    const draft = channelId ? (this.state.drafts()[channelId]?.content ?? '') : '';
    this.text.set(draft);
    this.attachments.set([]);
    queueMicrotask(() => this.resize());
  }

  private resize(): void {
    const node = this.textareaRef()?.nativeElement;
    if (!node) return;
    const max = this.compact() || this.mode() === 'thread' ? 150 : 220;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, max)}px`;
    node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden';
  }
}
