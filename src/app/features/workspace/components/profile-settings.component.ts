import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideCheck,
  LucideChevronRight,
  LucideCommand,
  LucideImage,
  LucideKeyboard,
  LucideLoaderCircle,
  LucideLogOut,
  LucideMoon,
  LucidePalette,
  LucideRotateCcw,
  LucideSave,
  LucideSun,
  LucideUserRound,
  LucideX,
} from '@lucide/angular';
import { PresenceState } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { DemoStoreService } from '../../../core/demo/demo-store.service';
import { ThemeService, AccentKey, ThemeMode } from '../../../core/services/theme.service';
import { ToastService } from '../../../core/services/toast.service';
import { UploadService } from '../../../core/services/upload.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar.component';

type SettingsTab = 'profile' | 'appearance' | 'shortcuts';

interface PresenceChoice {
  key: PresenceState;
  label: string;
  color: string;
}

interface AccentChoice {
  key: AccentKey;
  label: string;
  value: string;
}

const PRESENCE: PresenceChoice[] = [
  { key: 'online', label: 'Active', color: 'var(--success)' },
  { key: 'away', label: 'Away', color: 'var(--warning)' },
  { key: 'dnd', label: 'Focus', color: 'var(--danger)' },
  { key: 'offline', label: 'Invisible', color: 'var(--muted-2)' },
];

const ACCENTS: AccentChoice[] = [
  { key: 'red', label: 'Red', value: '#ef4444' },
  { key: 'rose', label: 'Rose', value: '#f43f5e' },
  { key: 'amber', label: 'Amber', value: '#f59e0b' },
  { key: 'emerald', label: 'Emerald', value: '#10b981' },
  { key: 'cyan', label: 'Cyan', value: '#06b6d4' },
  { key: 'violet', label: 'Violet', value: '#7c6cff' },
];

const SHORTCUTS = [
  { keys: ['⌘', 'K'], label: 'Open the command palette' },
  { keys: ['⌘', 'Shift', 'K'], label: 'Search messages in this channel' },
  { keys: ['⌘', 'Shift', 'N'], label: 'Create a new channel' },
  { keys: ['⌘', 'Shift', 'M'], label: 'Open members' },
  { keys: ['Esc'], label: 'Close panels, threads, and dialogs' },
  { keys: ['Shift', 'Enter'], label: 'Add a new line in the composer' },
  { keys: ['↑', '↓'], label: 'Move through command palette results' },
];

@Component({
  selector: 'app-profile-settings',
  imports: [
    ReactiveFormsModule,
    UserAvatarComponent,
    LucideCheck,
    LucideChevronRight,
    LucideCommand,
    LucideImage,
    LucideKeyboard,
    LucideLoaderCircle,
    LucideLogOut,
    LucideMoon,
    LucidePalette,
    LucideRotateCcw,
    LucideSave,
    LucideSun,
    LucideUserRound,
    LucideX,
  ],
  templateUrl: './profile-settings.component.html',
  styleUrl: './profile-settings.component.css',
})
export class ProfileSettingsComponent {
  readonly closed = output<void>();

  protected readonly auth = inject(AuthService);
  protected readonly state = inject(ChatStateService);
  protected readonly theme = inject(ThemeService);
  private readonly demo = inject(DemoStoreService);
  private readonly toast = inject(ToastService);
  private readonly upload = inject(UploadService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'profile', label: 'Profile' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'shortcuts', label: 'Shortcuts' },
  ];
  protected readonly presenceChoices = PRESENCE;
  protected readonly accents = ACCENTS;
  protected readonly shortcuts = SHORTCUTS;

  protected readonly tab = signal<SettingsTab>('profile');
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly avatarPreview = signal<string | null>(this.auth.profile()?.avatar_url ?? null);
  protected readonly presence = signal<PresenceState>(
    this.auth.profile()?.presence ?? 'online',
  );

  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteConfirmText = signal('');
  protected readonly canDelete = computed(() => this.deleteConfirmText().trim() === 'DELETE');

  protected readonly profile = this.auth.profile;
  protected readonly isDemo = this.auth.isDemo;
  protected readonly email = this.auth.email;
  protected readonly modeLabel = computed(() =>
    this.auth.isDemo() ? 'Demo workspace' : 'Connected to Supabase',
  );
  protected readonly memberSince = computed(() => {
    const created = this.auth.profile()?.created_at;
    if (!created) return null;
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
      new Date(created),
    );
  });

  protected readonly form = this.fb.nonNullable.group({
    display_name: [
      this.auth.profile()?.display_name ?? '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(40)],
    ],
    handle: [
      this.auth.profile()?.handle ?? '',
      [Validators.required, Validators.pattern(/^[a-z0-9_]{3,24}$/)],
    ],
    status_message: [this.auth.profile()?.status_message ?? '', [Validators.maxLength(120)]],
  });

  protected setTab(tab: SettingsTab): void {
    this.tab.set(tab);
  }

  protected setPresence(presence: PresenceState): void {
    this.presence.set(presence);
  }

  protected onAvatarPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void this.uploadAvatar(file);
  }

  private async uploadAvatar(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.toast.error('That is not an image', 'Choose a PNG, JPG, or WebP file.');
      return;
    }
    this.uploading.set(true);
    try {
      const attachment = await this.upload.upload(file, 'avatars');
      this.avatarPreview.set(attachment.url);
    } catch (error) {
      this.toast.error(
        'Could not upload avatar',
        error instanceof Error ? error.message : 'Try a smaller file.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  protected removeAvatar(): void {
    this.avatarPreview.set(null);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const updated = await this.auth.updateProfile({
        display_name: value.display_name,
        handle: value.handle,
        status_message: value.status_message.trim() || null,
        avatar_url: this.avatarPreview(),
        presence: this.presence(),
      });
      this.state.updateProfileSnapshot(updated);
      this.toast.success('Profile saved', 'Your teammates will see the update right away.');
    } catch (error) {
      this.toast.error(
        'Could not save profile',
        error instanceof Error ? this.auth.friendlyError(error.message) : undefined,
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.setTheme(mode);
  }

  protected setAccent(accent: AccentKey): void {
    this.theme.setAccent(accent);
  }

  protected async resetDemo(): Promise<void> {
    const slug = this.state.activeWorkspace()?.slug ?? null;
    this.demo.reset();
    this.state.leave();
    this.auth.startDemo();
    await this.state.bootstrap(slug);
    this.toast.success('Demo restored', 'Sample conversations are back to their original state.');
  }

  protected async signOut(): Promise<void> {
    this.state.leave();
    await this.auth.signOut();
    await this.router.navigate(['/auth']);
  }

  protected toggleDelete(): void {
    this.confirmingDelete.update((open) => !open);
    this.deleteConfirmText.set('');
  }

  protected onDeleteConfirmInput(event: Event): void {
    this.deleteConfirmText.set((event.target as HTMLInputElement).value);
  }

  protected async deleteAccount(): Promise<void> {
    if (!this.canDelete() || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.auth.deleteAccount();
      this.state.leave();
      this.toast.success('Account deleted', 'Your account and data have been removed.');
      await this.router.navigate(['/auth']);
    } catch (error) {
      this.toast.error(
        'Could not delete account',
        error instanceof Error
          ? error.message
          : 'Make sure the delete_my_account function exists in Supabase.',
      );
    } finally {
      this.deleting.set(false);
    }
  }

  protected close(): void {
    if (this.saving() || this.uploading()) return;
    this.closed.emit();
  }
}
