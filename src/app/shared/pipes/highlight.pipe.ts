import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined, query: string | null | undefined): SafeHtml {
    if (!value) return '';
    if (!query?.trim()) return escapeHtml(value);

    const safe = escapeHtml(value);
    const safeQuery = escapeHtml(query.trim());
    const pattern = new RegExp(`(${escapeRegExp(safeQuery)})`, 'gi');
    return this.sanitizer.bypassSecurityTrustHtml(
      safe.replace(pattern, '<mark class="search-highlight">$1</mark>'),
    );
  }
}
