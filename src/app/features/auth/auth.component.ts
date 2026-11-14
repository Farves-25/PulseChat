import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
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
  LucideArrowLeft,
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

type AuthTab = 'signin' | 'signup' | 'forgot' | 'reset';

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
    LucideArrowLeft,
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
  protected readonly showConfirmPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly magicLinkSending = signal(false);
  protected readonly forgotSending = signal(false);
  protected readonly submitted = signal(false);

  protected readonly isSignup = computed(() => this.tab() === 'signup');
  protected readonly isForgot = computed(() => this.tab() === 'forgot');
  protected readonly isReset = computed(() => this.tab() === 'reset');

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

  protected readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly resetForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    // Check if user came from a password recovery link
    if (typeof window !== 'undefined') {
      const href = window.location.href;
      const search = window.location.search;
      if (href.includes('type=recovery') || search.includes('reset=true') || this.auth.isPasswordRecovery()) {
        this.tab.set('reset');
        this.notice.set('You are authenticated to set a new password.');
      }
    }

    effect(() => {
      if (this.auth.isPasswordRecovery()) {
        this.tab.set('reset');
        this.notice.set('You are authenticated to set a new password.');
      }
    });

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
    if (tab === 'signup' && this.tab() === 'signin') {
      const email = this.signInForm.controls.email.value;
      const password = this.signInForm.controls.password.value;
      if (email && !this.signUpForm.controls.email.value) {
        this.signUpForm.controls.email.setValue(email);
        const emailPrefix = email.split('@')[0] || '';
        const words = emailPrefix.split(/[._-]+/).filter(Boolean);
        const suggestedName = words
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        const suggestedHandle = emailPrefix
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 24);
        if (!this.signUpForm.controls.displayName.value && suggestedName) {
          this.signUpForm.controls.displayName.setValue(suggestedName);
        }
        if (!this.signUpForm.controls.handle.value && suggestedHandle) {
          this.signUpForm.controls.handle.setValue(suggestedHandle);
        }
      }
      if (password && !this.signUpForm.controls.password.value) {
        this.signUpForm.controls.password.setValue(password);
      }
    } else if (tab === 'signin' && this.tab() === 'signup') {
      const email = this.signUpForm.controls.email.value;
      const password = this.signUpForm.controls.password.value;
      if (email && !this.signInForm.controls.email.value) {
        this.signInForm.controls.email.setValue(email);
      }
      if (password && !this.signInForm.controls.password.value) {
        this.signInForm.controls.password.setValue(password);
      }
    }

    this.tab.set(tab);
    this.error.set(null);
    this.notice.set(null);
    this.submitted.set(false);
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.submitted.set(true);

    if (this.isForgot()) {
      await this.runForgotPassword();
      return;
    }

    if (this.isReset()) {
      await this.runResetPassword();
      return;
    }

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

  protected async runForgotPassword(): Promise<void> {
    const emailControl = this.forgotForm.controls.email;
    if (this.forgotForm.invalid) {
      emailControl.markAsTouched();
      this.error.set('Please enter a valid email address.');
      return;
    }

    this.submitting.set(true);
    try {
      const msg = await this.auth.sendPasswordReset(emailControl.value);
      this.notice.set(msg);
      this.toast.success('Reset email sent', 'Check your inbox (and Spam folder) for the reset link.');
    } catch (error) {
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async runResetPassword(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const { password, confirmPassword } = this.resetForm.getRawValue();
    if (password !== confirmPassword) {
      this.error.set('Passwords do not match. Please verify and try again.');
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.updatePassword(password);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      this.toast.success('Password updated', 'Welcome back to PulseChat!');
      await this.router.navigate(['/app'], { replaceUrl: true });
    } catch (error) {
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.submitting.set(false);
    }
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

  protected showError(form: 'signin' | 'signup' | 'forgot' | 'reset', field: string): boolean {
    const control =
      form === 'signin'
        ? this.signInForm.get(field)
        : form === 'signup'
          ? this.signUpForm.get(field)
          : form === 'forgot'
            ? this.forgotForm.get(field)
            : this.resetForm.get(field);
    return Boolean(control?.invalid && (control.touched || this.submitted()));
  }

  protected errorFor(form: 'signin' | 'signup' | 'forgot' | 'reset', field: string): string | null {
    const control =
      form === 'signin'
        ? this.signInForm.get(field)
        : form === 'signup'
          ? this.signUpForm.get(field)
          : form === 'forgot'
            ? this.forgotForm.get(field)
            : this.resetForm.get(field);
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
    const email = this.signInForm.controls.email.value.trim();
    const password = this.signInForm.controls.password.value;
    try {
      await this.auth.signIn(email, password);
      this.toast.success('Welcome back', 'Your workspace is ready.');
      await this.router.navigate(['/app']);
    } catch (error) {
      const raw = this.messageOf(error).toLowerCase();
      // If credentials do not match or user is not found, treat as a new user and prefill signup
      if (
        raw.includes('invalid login credentials') ||
        raw.includes('invalid_grant') ||
        raw.includes('user not found') ||
        raw.includes('does not match')
      ) {
        this.redirectToSignUpWithPrefill(email, password);
        return;
      }
      this.error.set(this.auth.friendlyError(this.messageOf(error)));
    } finally {
      this.submitting.set(false);
    }
  }

  private redirectToSignUpWithPrefill(email: string, password: string): void {
    const emailPrefix = email.split('@')[0] || '';
    const words = emailPrefix.split(/[._-]+/).filter(Boolean);
    const suggestedName = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const suggestedHandle = emailPrefix
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24);

    this.signUpForm.patchValue({
      email,
      password,
      displayName: this.signUpForm.controls.displayName.value || suggestedName,
      handle: this.signUpForm.controls.handle.value || suggestedHandle,
    });

    this.tab.set('signup');
    this.submitted.set(false);
    this.error.set(null);
    this.notice.set(
      'No account found with this email. We prefilled your details — just enter your name to finish creating your account!',
    );
    this.toast.info('New to PulseChat?', 'Just fill in your name to create your account.');

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const input = document.getElementById('signup-name') as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      }, 80);
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
