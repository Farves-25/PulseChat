import { Component, inject } from '@angular/core';
import {
  LucideCircleAlert,
  LucideCircleCheck,
  LucideInfo,
  LucideX,
} from '@lucide/angular';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toasts',
  imports: [LucideCircleAlert, LucideCircleCheck, LucideInfo, LucideX],
  template: `
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toasts.messages(); track toast.id) {
        <div
          class="glass-strong pointer-events-auto flex items-start gap-3 rounded-2xl p-3.5 pr-2.5 animate-slide-right"
          role="status"
        >
          <div
            class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            [style.background]="iconBackground(toast.tone)"
            [style.color]="iconColor(toast.tone)"
          >
            @switch (toast.tone) {
              @case ('success') {
                <svg lucideCircleCheck [size]="17"></svg>
              }
              @case ('error') {
                <svg lucideCircleAlert [size]="17"></svg>
              }
              @default {
                <svg lucideInfo [size]="17"></svg>
              }
            }
          </div>
          <div class="min-w-0 flex-1 pt-0.5">
            <p class="text-[0.8125rem] font-bold leading-5 text-soft">{{ toast.title }}</p>
            @if (toast.body) {
              <p class="mt-0.5 text-xs leading-5 text-muted">{{ toast.body }}</p>
            }
          </div>
          <button
            type="button"
            class="icon-btn h-7 w-7 shrink-0"
            aria-label="Dismiss notification"
            (click)="toasts.dismiss(toast.id)"
          >
            <svg lucideX [size]="14"></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly toasts = inject(ToastService);

  protected iconBackground(tone: 'success' | 'error' | 'info'): string {
    if (tone === 'success') return 'color-mix(in oklab, var(--success) 16%, transparent)';
    if (tone === 'error') return 'color-mix(in oklab, var(--danger) 16%, transparent)';
    return 'color-mix(in oklab, var(--info) 16%, transparent)';
  }

  protected iconColor(tone: 'success' | 'error' | 'info'): string {
    if (tone === 'success') return 'var(--success)';
    if (tone === 'error') return 'var(--danger)';
    return 'var(--info)';
  }
}
