/**
 * Theme application. The persisted choice is also read by a render-blocking
 * inline script in index.html (using the same 'pos:theme' key) to avoid FOUC
 * on cold start — keep the key in sync.
 */
import { STORAGE_KEYS } from '@/config/app.config';

export type ThemeChoice = 'dark' | 'light' | 'system';

export function resolveTheme(choice: ThemeChoice): 'dark' | 'light' {
  if (choice === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return choice;
}

/** animate=true only on an explicit user toggle (never on cold load). */
export function applyTheme(choice: ThemeChoice, animate = false): void {
  const el = document.documentElement;
  const resolved = resolveTheme(choice);
  localStorage.setItem(STORAGE_KEYS.theme, choice);
  if (animate) {
    el.classList.add('theme-transition');
    window.setTimeout(() => el.classList.remove('theme-transition'), 220);
  }
  el.dataset.theme = resolved;
}
