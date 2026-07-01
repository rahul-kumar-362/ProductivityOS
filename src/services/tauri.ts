/**
 * The ONLY file that imports @tauri-apps/api directly. Typed invoke/listen/emit
 * so feature services never touch raw strings or the Tauri API surface.
 */
import { invoke as rawInvoke } from '@tauri-apps/api/core';
import { listen as rawListen, emit as rawEmit, type UnlistenFn } from '@tauri-apps/api/event';

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return rawInvoke<T>(cmd, args);
}

export function listen<T>(event: string, cb: (payload: T) => void): Promise<UnlistenFn> {
  return rawListen<T>(event, (e) => cb(e.payload));
}

export function emit(event: string, payload?: unknown): Promise<void> {
  return rawEmit(event, payload);
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
