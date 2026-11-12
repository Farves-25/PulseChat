import {
  AfterViewInit,
  Directive,
  ElementRef,
  input,
  inject,
} from '@angular/core';

@Directive({
  selector: 'textarea[appAutosize]',
  host: {
    rows: '1',
    '(input)': 'resize()',
  },
})
export class AutosizeTextareaDirective implements AfterViewInit {
  readonly maxHeight = input(220);

  private readonly element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  ngAfterViewInit(): void {
    this.resize();
  }

  resize(): void {
    const node = this.element.nativeElement;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, this.maxHeight())}px`;
    node.style.overflowY = node.scrollHeight > this.maxHeight() ? 'auto' : 'hidden';
  }
}
