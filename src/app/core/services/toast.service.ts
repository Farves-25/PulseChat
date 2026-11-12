import { Service, signal } from '@angular/core';
import { ToastMessage } from '../models';

@Service()
export class ToastService {
  private counter = 0;
  readonly messages = signal<ToastMessage[]>([]);

  show(input: Omit<ToastMessage, 'id'>, duration = 4_500): number {
    this.counter += 1;
    const id = this.counter;
    const toast: ToastMessage = { ...input, id };

    this.messages.update((messages) => [...messages.slice(-3), toast]);
    window.setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  success(title: string, body?: string): void {
    this.show({ title, body, tone: 'success' });
  }

  error(title: string, body?: string): void {
    this.show({ title, body, tone: 'error' }, 6_000);
  }

  info(title: string, body?: string): void {
    this.show({ title, body, tone: 'info' });
  }

  dismiss(id: number): void {
    this.messages.update((messages) => messages.filter((message) => message.id !== id));
  }
}
