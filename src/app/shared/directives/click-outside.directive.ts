import { Directive, ElementRef, booleanAttribute, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appClickOutside]',
  host: {
    '(document:pointerdown)': 'onPointerDown($event)',
  },
})
export class ClickOutsideDirective {
  readonly enabled = input(true, { transform: booleanAttribute });
  readonly clickOutside = output<PointerEvent>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  onPointerDown(event: PointerEvent): void {
    if (!this.enabled()) return;
    const target = event.target;
    if (target instanceof Node && !this.element.nativeElement.contains(target)) {
      this.clickOutside.emit(event);
    }
  }
}
