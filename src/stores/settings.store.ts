import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/config/app.config';
import { applyTheme, type ThemeChoice } from '@/lib/theme/applyTheme';

/**
 * UI settings. floatOpacity persists to localStorage (shared across windows).
 * theme is initialized from the 'pos:theme' key (the same one the index.html
 * no-flash script reads) and written through applyTheme on change.
 */
interface SettingsState {
  theme: ThemeChoice;
  floatOpacity: number;
  setTheme: (t: ThemeChoice) => void;
  setFloatOpacity: (o: number) => void;
}

const initialTheme = (): ThemeChoice => {
  try {
    return (localStorage.getItem(STORAGE_KEYS.theme) as ThemeChoice | null) ?? 'dark';
  } catch {
    return 'dark';
  }
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: initialTheme(),
      floatOpacity: 0.9,
      setTheme: (theme) => {
        applyTheme(theme, true);
        set({ theme });
      },
      setFloatOpacity: (floatOpacity) => set({ floatOpacity }),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
      partialize: (s) => ({ floatOpacity: s.floatOpacity }),
    },
  ),
);
