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

@Pipe({ name: 'mentionParser' })
export class MentionParserPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined, currentHandle?: string | null): SafeHtml {
    if (!value) return '';

    const codeBlocks: string[] = [];
    let html = escapeHtml(value);

    // Fenced code blocks are extracted first so their content is never parsed.
    html = html.replace(/```([\w-]*)\r?\n?([\s\S]*?)```/g, (_match, language: string, code: string) => {
      const index = codeBlocks.push(
        `<div class="code-block"><div class="code-block__lang">${escapeHtml(language || 'code')}</div><pre><code>${code.replace(/^\r?\n|\r?\n$/g, '')}</code></pre></div>`,
      );
      return `\u0000CODEBLOCK${index - 1}\u0000`;
    });

    // Inline code.
    html = html.replace(
      /`([^`\n]+)`/g,
      '<code class="inline-code">$1</code>',
    );

    // Blockquotes.
    html = html.replace(/(?:^|\n)&gt; (.*?)(?=\n|$)/g, '\n<blockquote>$1</blockquote>');

    // Emphasis and strikethrough.
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^\w])\*([^*\n]+)\*(?=$|[^\w])/g, '$1<em>$2</em>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links.
    html = html.replace(/https?:\/\/[^\s<]+/g, (url) => {
      const trimmed = url.replace(/[.,!?;:)]+$/g, '');
      const suffix = url.slice(trimmed.length);
      const label = trimmed.replace(/^https?:\/\//, '');
      return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>${suffix}`;
    });

    // @mentions. The current user gets a stronger highlight.
    const me = currentHandle?.toLowerCase();
    html = html.replace(
      /(^|[\s(>])@([a-zA-Z0-9_.-]+)/g,
      (_match, prefix: string, handle: string) => {
        const isMe = me === handle.toLowerCase();
        return `${prefix}<button type="button" data-mention="${escapeHtml(handle)}" class="mention${isMe ? ' mention--me' : ''}">@${handle}</button>`;
      },
    );

    html = html.replace(/\r?\n/g, '<br>');
    html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
