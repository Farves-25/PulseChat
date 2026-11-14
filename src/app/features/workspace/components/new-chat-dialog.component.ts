import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideLoaderCircle,
  LucideMessageSquarePlus,
  LucideSearch,
  LucideX,
} from '@lucide/angular';
import { Channel, Profile } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

@Component({
  selector: 'app-new-chat-dialog',
  imports: [
    FormsModule,
    UserAvatarComponent,
    LucideLoaderCircle,
    LucideMessageSquarePlus,
    LucideSearch,
    LucideX,
  ],
  templateUrl: './new-chat-dialog.component.html',
  styleUrl: './new-chat-dialog.component.css',
})
export class NewChatDialogComponent {
  readonly closed = output<void>();
  readonly chatStarted = output<Channel>();

  private readonly state = inject(ChatStateService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly starting = signal(false);
  protected readonly users = signal<Profile[]>([]);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    void this.loadInitialUsers();
  }

  protected async onSearchInput(val: string): Promise<void> {
    this.query.set(val);
    this.loading.set(true);
    try {
      const results = await this.state.searchUsersByEmail(val);
      this.users.set(results);
    } finally {
      this.loading.set(false);
    }
  }

  protected async startChatWithUser(profile: Profile): Promise<void> {
    if (this.starting()) return;
    this.starting.set(true);
    try {
      const channel = await this.state.startDirectMessage(profile.id);
      if (channel) {
        this.chatStarted.emit(channel);
        this.closed.emit();
      }
    } finally {
      this.starting.set(false);
    }
  }

  protected async submitEmail(): Promise<void> {
    const q = this.query().trim();
    if (!q || this.starting()) return;

    // If query matches one of the loaded users, pick it
    const match = this.users().find(
      (u) =>
        u.email?.toLowerCase() === q.toLowerCase() ||
        u.handle.toLowerCase() === q.toLowerCase(),
    );
    if (match) {
      await this.startChatWithUser(match);
      return;
    }

    this.starting.set(true);
    try {
      const channel = await this.state.startChatByEmail(q);
      if (channel) {
        this.chatStarted.emit(channel);
        this.closed.emit();
      }
    } finally {
      this.starting.set(false);
    }
  }

  protected close(): void {
    if (this.starting()) return;
    this.closed.emit();
  }

  private async loadInitialUsers(): Promise<void> {
    this.loading.set(true);
    try {
      const results = await this.state.searchUsersByEmail('');
      this.users.set(results);
    } finally {
      this.loading.set(false);
    }
  }
}
