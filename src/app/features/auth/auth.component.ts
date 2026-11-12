import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  LucideArrowRight,
  LucideArrowUpRight,
  LucideAtSign,
  LucideCheck,
  LucideEye,
  LucideEyeOff,
  LucideHash,
  LucideKeyRound,
  LucideLoaderCircle,
  LucideLockKeyhole,
  LucideMail,
  LucideMessageSquare,
  LucidePlay,
  LucideShieldCheck,
  LucideSparkles,
  LucideUserRound,
  LucideUsers,
  LucideZap,
} from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { LogoMarkComponent } from '../../shared/components/logo-mark.component';

type AuthTab = 'signin' | 'signup';

function handleAvailability(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;
  return /^[a-z0-9_]{3,24}$/.test(value) ? null : { handle: true };
}

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    LogoMarkComponent,
    LucideArrowRight,
    LucideArrowUpRight,
    LucideAtSign,
    LucideCheck,
    LucideEye,
    LucideEyeOff,
    LucideHash,
    LucideKeyRound,
    LucideLoaderCircle,
    LucideLockKeyhole,
    LucideMail,
    LucideMessageSquare,
    LucidePlay,
    LucideShieldCheck,
    LucideSparkles,
    LucideUserRound,
    LucideZap,
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
})
export class AuthComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly toast = inject(ToastService);
  protected readonly theme = inject(ThemeService);
  protected readonly supabase = inject(SupabaseService);

  protected readonly tab = signal<AuthTab>('signin');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly magicLinkSending = signal(false);
  protected readonly submitted = signal(false);

  protected readonly isSignup = computed(() => this.tab() === 'signup');

  protected readonly signInForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected readonly signUpForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(48)]],
    handle: ['', [Validators.required, handleAvailability]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    this.signUpForm.controls.displayName.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((name) => {
        const handleControl = this.signUpForm.controls.handle;
        if (!handleControl.dirty) {
          const suggestion = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_ ]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 24);
          handleControl.setValue(suggestion, { emitEvent: false });
        }
      });
  }

  protected setTab(tab: AuthTab): void {
    this.tab.set(tab);
    this.error.set(null);
    this.notice.set(null);
    this.submitted.set(false);
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.submitted.set(true);

    if (this.isSignup()) {
      if (this.signUpForm.invalid) {
        this.signUpForm.markAllAsTouched();
        return;
      }
      await this.runSignUp();
      return;
    }

    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }
    await this.runSignIn();
  }

  protected async sendMagicLink(): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    const emailControl = this.signInForm.controls.email;
    if (emailControl.invalid) {
      emailControl.markAsTouched();
      this.error.set('Enter a valid email address first.');
      return;
    }

    this.magicLinkSending.set(true);
    try {
      const message = await this.auth.sendMagicLink(emailControl.value);
      this.notice.set(message);
      this.toast.success('Magic link sent', 'Check your inbox to finish signing in.');
    } catch (error) {
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.magicLinkSending.set(false);
    }
  }

  protected enterDemo(): void {
    this.error.set(null);
    this.auth.startDemo();
    this.toast.success('Welcome to the demo', 'You are exploring PulseChat as Alex Morgan.');
    void this.router.navigate(['/app']);
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  protected showError(form: 'signin' | 'signup', field: string): boolean {
    const control =
      form === 'signin'
        ? this.signInForm.get(field)
        : this.signUpForm.get(field);
    return Boolean(control?.invalid && (control.touched || this.submitted()));
  }

  protected errorFor(form: 'signin' | 'signup', field: string): string | null {
    const control =
      form === 'signin'
        ? this.signInForm.get(field)
        : this.signUpForm.get(field);
    if (!control?.errors) return null;
    if (control.errors['required']) return 'This field is required.';
    if (control.errors['email']) return 'Enter a valid email address.';
    if (control.errors['minlength']) {
      const required = control.errors['minlength']['requiredLength'] as number;
      return `Use at least ${required} characters.`;
    }
    if (control.errors['handle']) {
      return 'Use 3–24 lowercase letters, numbers, or underscores.';
    }
    return 'Please check this field.';
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  private async runSignIn(): Promise<void> {
    this.submitting.set(true);
    try {
      await this.auth.signIn(
        this.signInForm.controls.email.value,
        this.signInForm.controls.password.value,
      );
      this.toast.success('Welcome back', 'Your workspace is ready.');
      await this.router.navigate(['/app']);
    } catch (error) {
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.submitting.set(false);
    }
  }

  private async runSignUp(): Promise<void> {
    this.submitting.set(true);
    try {
      const values = this.signUpForm.getRawValue();
      const result = await this.auth.signUp({
        displayName: values.displayName,
        handle: values.handle,
        email: values.email,
        password: values.password,
      });

      if (result.needsConfirmation) {
        this.notice.set(result.message);
        this.toast.info('Almost there', 'Confirm your email to activate your account.');
        return;
      }

      this.toast.success('Account created', 'Welcome to PulseChat.');
      await this.router.navigate(['/app']);
    } catch (error) {
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.submitting.set(false);
    }
  }

  private messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Something went wrong. Please try again.';
  }
}
