/**
 * Tauri command names (invoke targets). The tauri.ts / window.service wrappers
 * are the only callers. Rust registers matching #[tauri::command] handlers.
 */
export const COMMANDS = {
  openTimer: 'open_timer',
  closeTimer: 'close_timer',
  timerWindowReady: 'timer_window_ready',
  setClickThrough: 'set_click_through',
  setFloatAlwaysOnTop: 'set_float_always_on_top',
} as const;

export type CommandName = (typeof COMMANDS)[keyof typeof COMMANDS];
