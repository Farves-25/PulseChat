import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideCheck,
  LucideLoaderCircle,
  LucideSparkles,
  LucideX,
} from '@lucide/angular';
import { Workspace } from '../../../core/models';
import { ChatStateService } from '../../../core/services/chat-state.service';

const ICONS = ['✨', '🚀', '🌿', '🎨', '⚡', '🔥', '🌊', '🛠️', '🧠', '🎯', '📚', '🪐'];

@Component({
  selector: 'app-create-workspace-dialog',
  imports: [ReactiveFormsModule, LucideCheck, LucideLoaderCircle, LucideSparkles, LucideX],
  templateUrl: './create-workspace-dialog.component.html',
  styleUrl: './create-workspace-dialog.component.css',
})
export class CreateWorkspaceDialogComponent {
  readonly closed = output<void>();
  readonly created = output<Workspace>();

  private readonly state = inject(ChatStateService);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICONS;
  protected readonly selectedIcon = signal(ICONS[0]);
  protected readonly creating = signal(false);
  protected readonly submitted = signal(false);
  protected readonly nameValue = signal('');
  protected readonly slugEdited = signal(false);
  protected readonly slugValue = signal('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(40)]],
    slug: [
      '',
      [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9-]{1,31}$/)],
    ],
  });

  protected readonly slugPreview = computed(() => {
    if (this.slugEdited()) {
      return (
        this.slugValue()
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-') || 'workspace'
      );
    }
    return (
      this.nameValue()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 32) || 'workspace'
    );
  });

  protected onNameInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.nameValue.set(value);
    if (!this.slugEdited()) {
      this.form.controls.slug.setValue(this.slugPreview());
    }
  }

  protected onSlugInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.slugEdited.set(true);
    this.slugValue.set(value);
    this.form.controls.slug.setValue(
      value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-'),
    );
  }

  protected pickIcon(icon: string): void {
    this.selectedIcon.set(icon);
  }

  protected showNameError(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.touched || this.submitted());
  }

  protected showSlugError(): boolean {
    const control = this.form.controls.slug;
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creating()) return;

    this.creating.set(true);
    try {
      const workspace = await this.state.createWorkspace({
        name: this.form.controls.name.value,
        slug: this.slugPreview(),
        icon: this.selectedIcon(),
      });
      if (workspace) {
        this.created.emit(workspace);
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
