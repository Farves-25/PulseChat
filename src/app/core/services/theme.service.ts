import { Service, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';
export type AccentKey = 'red' | 'violet' | 'cyan' | 'rose' | 'emerald' | 'amber';

const THEME_KEY = 'pulsechat.theme';
const ACCENT_KEY = 'pulsechat.accent';

@Service()
export class ThemeService {
  readonly theme = signal<ThemeMode>(this.initialTheme());
  readonly accent = signal<AccentKey>(this.initialAccent());
  readonly isDark = () => this.theme() === 'dark';

  constructor() {
    this.apply();
  }

  setTheme(theme: ThemeMode): void {
    this.theme.set(theme);
    this.apply();
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage failures.
    }
  }

  toggle(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setAccent(accent: AccentKey): void {
    this.accent.set(accent);
    this.apply();
    try {
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      // Ignore storage failures.
    }
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', this.theme() === 'dark');
    root.dataset['accent'] = this.accent();
    root.style.colorScheme = this.theme();
  }

  private initialTheme(): ThemeMode {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  private initialAccent(): AccentKey {
    try {
      const stored = localStorage.getItem(ACCENT_KEY);
      if (
        stored === 'red' ||
        stored === 'violet' ||
        stored === 'cyan' ||
        stored === 'rose' ||
        stored === 'emerald' ||
        stored === 'amber'
      ) {
        if (stored === 'violet') {
          localStorage.setItem(ACCENT_KEY, 'red');
          return 'red';
        }
        return stored;
      }
    } catch {
      // Ignore storage failures.
    }
    return 'red';
  }
}
