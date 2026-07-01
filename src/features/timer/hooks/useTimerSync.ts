import { useEffect } from 'react';
import { listen, isTauri } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { useTimerStore } from '@/stores/timer.store';
import { timerCommands } from '../services/timerCommands';
import type { TimerSnapshot } from '../domain/types';

/**
 * Subscribes a window to authoritative engine broadcasts. Call in EVERY window
 * shell (main + floating). Requests a fresh snapshot on mount (twice, to beat a
 * possible race with the engine's listener setup).
 */
export function useTimerSync(): void {
  const setSnapshot = useTimerStore((s) => s.setSnapshot);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<TimerSnapshot>(EVENTS.timerState, setSnapshot).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    void timerCommands.requestState();
    const retry = setTimeout(() => void timerCommands.requestState(), 600);
    return () => {
      disposed = true;
      clearTimeout(retry);
      unlisten?.();
    };
  }, [setSnapshot]);
}
