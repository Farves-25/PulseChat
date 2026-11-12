import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideCheck,
  LucideGlobe,
  LucideLoaderCircle,
  LucideLock,
  LucidePlus,
  LucideX,
} from '@lucide/angular';
import { Channel, Profile } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

@Component({
  selector: 'app-create-channel-dialog',
  imports: [
    ReactiveFormsModule,
    UserAvatarComponent,
    LucideCheck,
    LucideGlobe,
    LucideLoaderCircle,
    LucideLock,
    LucidePlus,
    LucideX,
  ],
  templateUrl: './create-channel-dialog.component.html',
  styleUrl: './create-channel-dialog.component.css',
})
export class CreateChannelDialogComponent {
  readonly closed = output<void>();
  readonly created = output<Channel>();

  protected readonly state = inject(ChatStateService);
  private readonly fb = inject(FormBuilder);

  protected readonly isPrivate = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly creating = signal(false);
  protected readonly submitted = signal(false);
  protected readonly nameValue = signal('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9-_ ]{1,31}$/)]],
    topic: ['', [Validators.maxLength(140)]],
  });

  protected readonly workspaceName = computed(
    () => this.state.activeWorkspace()?.name ?? 'your workspace',
  );
  protected readonly others = computed(() =>
    this.state.memberProfiles().filter((profile) => profile.id !== this.state.currentUserId()),
  );
  protected readonly slugPreview = computed(() => {
    const raw = this.nameValue();
    return (
      raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 32) || 'new-channel'
    );
  });

  protected setPrivate(value: boolean): void {
    this.isPrivate.set(value);
    if (!value) this.selectedIds.set(new Set());
  }

  protected onNameInput(event: Event): void {
    this.nameValue.set((event.target as HTMLInputElement).value);
  }

  protected toggleMember(profile: Profile): void {
    const current = new Set(this.selectedIds());
    if (current.has(profile.id)) current.delete(profile.id);
    else current.add(profile.id);
    this.selectedIds.set(current);
  }

  protected isSelected(profile: Profile): boolean {
    return this.selectedIds().has(profile.id);
  }

  protected showNameError(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creating()) return;

    const value = this.form.getRawValue();
    this.creating.set(true);
    try {
      const channel = await this.state.createChannel({
        name: value.name,
        topic: value.topic.trim(),
        isPrivate: this.isPrivate(),
        memberIds: this.isPrivate() ? [...this.selectedIds()] : [],
      });
      if (channel) {
        this.created.emit(channel);
        this.closed.emit();
      }
    } finally {
      this.creating.set(false);
    }
  }

  protected close(): void {
    if (this.creating()) return;
    this.closed.emit();
  }
}
