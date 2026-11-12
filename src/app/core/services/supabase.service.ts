import { Service } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment.generated';

@Service()
export class SupabaseService {
  readonly configured = environment.supabaseConfigured;
  readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
        realtime: {
          params: {
            eventsPerSecond: 12,
          },
        },
      })
    : null;

  requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to your .env file.',
      );
    }
    return this.client;
  }
}
