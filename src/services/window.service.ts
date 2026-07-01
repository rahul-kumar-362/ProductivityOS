/**
 * Floating-timer window control. Wraps the Rust window-lifecycle commands.
 */
import { invoke, isTauri } from './tauri';
import { COMMANDS } from '@/config/commands.config';

export const windowService = {
  openFloatingTimer: () => (isTauri() ? invoke<void>(COMMANDS.openTimer) : Promise.resolve()),
  closeFloatingTimer: () => (isTauri() ? invoke<void>(COMMANDS.closeTimer) : Promise.resolve()),
  /** floating window signals it has painted -> Rust reveals it (no black flash) */
  signalFloatReady: () => (isTauri() ? invoke<void>(COMMANDS.timerWindowReady) : Promise.resolve()),
  setClickThrough: (enabled: boolean) =>
    isTauri() ? invoke<void>(COMMANDS.setClickThrough, { enabled }) : Promise.resolve(),
  setFloatAlwaysOnTop: (onTop: boolean) =>
    isTauri() ? invoke<void>(COMMANDS.setFloatAlwaysOnTop, { onTop }) : Promise.resolve(),
};
