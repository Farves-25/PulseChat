import { Service, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { Profile } from '../models';
import { DemoStoreService } from '../demo/demo-store.service';
import { SupabaseService } from './supabase.service';

export type AuthMode = 'supabase' | 'demo' | null;

export interface SignUpResult {
  needsConfirmation: boolean;
  message: string;
}

@Service()
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly demo = inject(DemoStoreService);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(true);
  readonly mode = signal<AuthMode>(null);
  readonly isPasswordRecovery = signal(false);
  readonly ready: Promise<void>;

  readonly isAuthenticated = computed(() => this.profile() !== null && this.mode() !== null);
  readonly isDemo = computed(() => this.mode() === 'demo');
  readonly hasSupabase = this.supabase.configured;
  readonly email = computed(() => this.profile()?.email ?? this.session()?.user.email ?? null);

  readonly currentUserId = computed(() => this.profile()?.id ?? this.session()?.user.id ?? null);

  constructor() {
    this.ready = this.initialize();
  }

  async signIn(email: string, password: string): Promise<void> {
    if (!this.supabase.client) {
      throw new Error(
        'Supabase is not configured. Add your credentials to .env, or explore the demo workspace.',
      );
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      this.session.set(data.session);
      if (data.user) await this.loadSupabaseProfile(data.user.id);
      this.demo.disable();
      this.mode.set('supabase');
    } finally {
      this.loading.set(false);
    }
  }

  async signUp(input: {
    displayName: string;
    handle: string;
    email: string;
    password: string;
  }): Promise<SignUpResult> {
    if (!this.supabase.client) {
      throw new Error(
        'Supabase is not configured. Add your credentials to .env, or explore the demo workspace.',
      );
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            display_name: input.displayName.trim(),
            handle: input.handle.trim().toLowerCase(),
          },
        },
      });
      if (error) throw error;

      if (data.session && data.user) {
        this.session.set(data.session);
        await this.loadSupabaseProfile(data.user.id);
        this.demo.disable();
        this.mode.set('supabase');
        return { needsConfirmation: false, message: 'Welcome to PulseChat.' };
      }

      return {
        needsConfirmation: true,
        message:
          'Check your inbox to confirm your email, then sign in. Tip: you can disable email confirmation in Supabase → Authentication → Providers → Email.',
      };
    } finally {
      this.loading.set(false);
    }
  }

  /** Starts the Google OAuth redirect flow. The browser leaves the page on success. */
  async signInWithGoogle(): Promise<void> {
    if (!this.supabase.client) {
      throw new Error(
        'Supabase is not configured. Add your credentials to .env, or explore the demo workspace.',
      );
    }

    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) throw error;
  }

  async sendPasswordReset(email: string): Promise<string> {
    if (!this.supabase.client) {
      if (this.isDemo()) {
        return 'Demo mode: Password reset email simulated. Add Supabase keys to send real emails.';
      }
      throw new Error(
        'Supabase is not configured. Add your credentials to .env, or explore the demo workspace.',
      );
    }

    const redirectTo = `${window.location.origin}/auth?reset=true`;
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) throw error;
    return 'Password reset link sent! Please check your inbox (and Spam folder).';
  }

  async checkEmailExists(email: string): Promise<boolean | null> {
    if (!this.supabase.client) return null;
    const cleanEmail = email.trim().toLowerCase();

    // Only the RPC gives a trustworthy answer. Returns null when it is not installed,
    // so callers never wrongly treat an existing account (e.g. a Google user) as new.
    try {
      const { data, error } = await this.supabase.client.rpc('check_email_exists', {
        check_email: cleanEmail,
      });
      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch {
      // Fall through
    }
    return null;
  }

  async updatePassword(newPassword: string): Promise<void> {
    if (!this.supabase.client) {
      if (this.isDemo()) return;
      throw new Error(
        'Supabase is not configured. Add your credentials to .env, or explore the demo workspace.',
      );
    }

    const { data, error } = await this.supabase.client.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;

    const { data: sessionData } = await this.supabase.client.auth.getSession();
    const session = sessionData.session;
    this.session.set(session);
    this.mode.set('supabase');
    this.demo.disable();
    this.isPasswordRecovery.set(false);

    const user = data.user ?? session?.user;
    if (user) {
      await this.loadSupabaseProfile(user.id);
    }
  }

  startDemo(): void {
    this.demo.enable();
    this.demo.active.set(true);
    this.mode.set('demo');
    this.session.set(null);
    this.profile.set(this.demo.getCurrentProfile());
  }

  async signOut(): Promise<void> {
    if (this.supabase.client && this.mode() === 'supabase') {
      await this.supabase.client.auth.signOut();
    }
    this.demo.disable();
    this.session.set(null);
    this.profile.set(null);
    this.mode.set(null);
  }

  /** Permanently deletes the signed-in Supabase user and all of their data. */
  async deleteAccount(): Promise<void> {
    const client = this.supabase.requireClient();
    const { error } = await client.rpc('delete_my_account');
    if (error) throw new Error(this.friendlyError(error.message));
    await this.signOut();
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const current = this.profile();
    if (!current) throw new Error('You must be signed in.');

    const cleanPatch: Partial<Profile> = {
      display_name: patch.display_name?.trim() || current.display_name,
      handle: patch.handle?.trim().toLowerCase() || current.handle,
      status_message: patch.status_message ?? current.status_message,
      avatar_url: patch.avatar_url ?? current.avatar_url,
      presence: patch.presence ?? current.presence,
    };

    if (this.mode() === 'demo') {
      const updated = await this.demo.updateProfile(current.id, cleanPatch);
      this.profile.set(updated);
      return updated;
    }

    const client = this.supabase.requireClient();
    const { data, error } = await client
      .from('profiles')
      .update({
        display_name: cleanPatch.display_name,
        handle: cleanPatch.handle,
        status_message: cleanPatch.status_message,
        avatar_url: cleanPatch.avatar_url,
        presence: cleanPatch.presence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select()
      .single();

    if (error) throw new Error(this.friendlyError(error.message));

    const updated: Profile = {
      ...(data as Profile),
      presence: (data as Profile).presence ?? 'online',
    };
    this.profile.set(updated);
    return updated;
  }

  async setPresence(presence: Profile['presence']): Promise<void> {
    const current = this.profile();
    if (!current) return;
    this.profile.set({ ...current, presence });
    try {
      await this.updateProfile({ presence });
    } catch {
      // Presence is best-effort; keep the local state.
    }
  }

  async refreshProfile(): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;
    if (this.mode() === 'demo') {
      this.profile.set(this.demo.getCurrentProfile());
      return;
    }
    await this.loadSupabaseProfile(userId);
  }

  friendlyError(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid login credentials')) {
      return 'Incorrect email or password. If you signed up with Google, use Continue with Google, or reset your password.';
    }
    if (normalized.includes('email not confirmed')) {
      return 'Please confirm your email address before signing in.';
    }
    if (normalized.includes('user already registered')) {
      return 'This email may be registered with Google — use Continue with Google, or reset your password.';
    }
    if (normalized.includes('duplicate key') && normalized.includes('handle')) {
      return 'That handle is already taken. Try another one.';
    }
    if (normalized.includes('password should be at least')) {
      return 'Password must be at least 6 characters long.';
    }
    if (normalized.includes('rate limit')) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    return message;
  }

  private async initialize(): Promise<void> {
    // A demo session takes precedence so exploring the demo survives a reload.
    if (this.demo.hasDemoSession()) {
      this.demo.active.set(true);
      this.mode.set('demo');
      this.profile.set(this.demo.getCurrentProfile());
      this.loading.set(false);
      return;
    }

    if (!this.supabase.client) {
      this.loading.set(false);
      return;
    }

    try {
      const { data } = await this.supabase.client.auth.getSession();
      this.session.set(data.session);
      if (data.session?.user) {
        await this.loadSupabaseProfile(data.session.user.id);
        this.mode.set('supabase');
      }
    } catch {
      this.session.set(null);
    } finally {
      this.loading.set(false);
    }

    this.supabase.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecovery.set(true);
      }
      if (event === 'SIGNED_OUT' || !session?.user) {
        if (this.mode() === 'supabase') {
          this.profile.set(null);
          this.mode.set(null);
        }
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        this.demo.disable();
        this.mode.set('supabase');
        if (!this.profile() || this.profile()?.id !== session.user.id) {
          void this.loadSupabaseProfile(session.user.id);
        }
      }
    });
  }

  private async loadSupabaseProfile(userId: string): Promise<void> {
    const client = this.supabase.requireClient();
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (error) {
      throw new Error(this.friendlyError(error.message));
    }

    if (data) {
      this.profile.set({
        ...(data as Profile),
        presence: (data as Profile).presence ?? 'online',
      });
      return;
    }

    // A profile trigger normally creates this row. If an older project is missing
    // the trigger, create a sensible fallback profile from auth metadata.
    const user = this.session()?.user as User | undefined;
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const emailPrefix = user?.email?.split('@')[0] ?? 'member';
    const fallbackHandle = String(metadata?.['handle'] ?? emailPrefix)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24) || 'member';
    const fallback: Profile = {
      id: userId,
      display_name: String(metadata?.['display_name'] ?? emailPrefix),
      handle: fallbackHandle,
      avatar_url: null,
      status_message: 'Available',
      presence: 'online',
      email: user?.email ?? null,
    };

    const profileToInsert = {
      ...fallback,
      handle: `${fallbackHandle}${Math.floor(Math.random() * 900 + 100)}`,
    };
    const { data: inserted, error: insertError } = await client
      .from('profiles')
      .insert(profileToInsert)
      .select()
      .maybeSingle();

    if (insertError) {
      console.warn('loadSupabaseProfile insert fallback warning:', insertError.message);
      this.profile.set(fallback);
      return;
    }
    this.profile.set((inserted as Profile) ?? fallback);
  }
}
