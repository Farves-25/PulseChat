import { Component, computed, input, output, signal } from '@angular/core';
import { LucideSearch } from '@lucide/angular';
import { ClickOutsideDirective } from '../../../shared/directives/click-outside.directive';
import { EMOJI_CATEGORIES } from '../../../shared/data/emojis';

@Component({
  selector: 'app-emoji-picker',
  imports: [ClickOutsideDirective, LucideSearch],
  template: `
    <div
      class="glass-strong w-[19.5rem] overflow-hidden rounded-2xl animate-pop"
      appClickOutside
      (clickOutside)="closed.emit()"
      role="dialog"
      aria-label="Emoji picker"
    >
      <div class="flex items-center gap-2 border-b border-default px-2.5 py-2">
        <svg lucideSearch class="shrink-0 text-muted" [size]="14"></svg>
        <input
          class="w-full bg-transparent text-[0.75rem] text-soft outline-none placeholder:text-muted-2"
          type="search"
          placeholder="Search emoji"
          aria-label="Search emoji"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </div>

      @if (!query()) {
        <div class="no-scrollbar flex gap-0.5 overflow-x-auto border-b border-default px-1.5 py-1.5">
          @for (category of categories; track category.name; let index = $index) {
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm transition"
              [class.bg-accent-soft]="activeTab() === index"
              [class.opacity-100]="activeTab() === index"
              [class.opacity-60]="activeTab() !== index"
              [attr.aria-label]="category.name"
              [attr.aria-pressed]="activeTab() === index"
              (click)="activeTab.set(index)"
            >
              {{ category.icon }}
            </button>
          }
        </div>
      }

      <div class="no-scrollbar grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2" role="listbox">
        @for (emoji of visible(); track emoji + $index) {
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-[1.05rem] leading-none transition hover:bg-[var(--surface-3)] focus-visible:bg-[var(--surface-3)]"
            role="option"
            [attr.aria-label]="emoji"
            (click)="pick(emoji)"
          >
            {{ emoji }}
          </button>
        } @empty {
          <p class="col-span-8 py-6 text-center text-[0.72rem] text-muted">No emoji found.</p>
        }
      </div>

      <div class="flex items-center justify-between border-t border-default px-3 py-1.5 text-[0.6rem] text-muted-2">
        <span>{{ query() ? 'Search results' : categories[activeTab()].name }}</span>
        <span>{{ visible().length }} emoji</span>
      </div>
    </div>
  `,
})
export class EmojiPickerComponent {
  readonly closeOnPick = input(true);
  readonly closed = output<void>();
  readonly picked = output<string>();

  protected readonly categories = EMOJI_CATEGORIES;
  protected readonly query = signal('');
  protected readonly activeTab = signal(0);

  protected readonly visible = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (term) {
      const matches = EMOJI_CATEGORIES.flatMap((category) => category.emojis).filter((emoji) =>
        emoji.toLowerCase().includes(term),
      );
      return matches.slice(0, 120);
    }
    const category = this.categories[this.activeTab()] ?? this.categories[0];
    return category.emojis;
  });

  protected pick(emoji: string): void {
    this.picked.emit(emoji);
    if (this.closeOnPick()) this.closed.emit();
  }
}
