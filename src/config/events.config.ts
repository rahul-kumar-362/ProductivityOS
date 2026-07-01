/**
 * Tauri event names. The ONLY place these strings are defined.
 * Rust emits, windows listen. Namespaced with `://` by domain.
 */
export const EVENTS = {
  // Timer engine broadcasts (main window engine -> all windows)
  timerState: 'timer://state',
  timerFinished: 'timer://finished',
  timerBlockComplete: 'timer://block-complete',
  // Commands (any window -> main-window engine)
  timerCommand: 'timer://command',
  timerRequestState: 'timer://request-state',
  // Floating window
  floatingOpacity: 'floating://opacity',
  // Tray intents (Rust -> frontend reacts)
  trayTimerToggle: 'tray://timer-toggle',
  trayQuickAdd: 'tray://quick-add',
  // Data changed (streak/rollup) -> UI refresh
  statsChanged: 'stats://changed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
