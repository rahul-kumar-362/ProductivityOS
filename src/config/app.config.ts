/**
 * App-wide constants. Single source of truth — no magic strings elsewhere.
 */
export const APP = {
  name: 'ProductivityOS',
  mainWindowLabel: 'main',
  floatWindowLabel: 'floating-timer',
  startupBudgetMs: 2000,
} as const;

/** localStorage keys (settings + ui stores persist here for zero-flash startup). */
export const STORAGE_KEYS = {
  settings: 'pos.settings.v1',
  ui: 'pos.ui.v1',
  theme: 'pos:theme',
} as const;

/** SQLite database — file name + tauri-plugin-sql URL (rooted in app-data dir). */
export const DB = {
  name: 'productivityos.db',
  url: 'sqlite:productivityos.db',
} as const;
