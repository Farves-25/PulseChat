import {
  AfterViewChecked,
  Directive,
  ElementRef,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';

/**
 * Keeps a scroll container pinned to the bottom while content grows.
 * The directive intentionally only scrolls when the user is already near
 * the bottom, so reading history is never interrupted.
 */
@Directive({
  selector: '[appAutoScroll]',
  host: { class: 'scroll-smooth' },
})
export class AutoScrollDirective implements AfterViewChecked {
  readonly enabled = input(true, { transform: booleanAttribute });
  readonly threshold = input(120);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private lastHeight = 0;

  ngAfterViewChecked(): void {
    if (!this.enabled()) return;

    const node = this.element.nativeElement;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const grew = node.scrollHeight !== this.lastHeight;
    this.lastHeight = node.scrollHeight;

    if (grew && distanceFromBottom <= this.threshold()) {
      node.scrollTop = node.scrollHeight;
    }
  }
}
