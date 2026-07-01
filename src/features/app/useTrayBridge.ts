import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { ROUTES } from '@/config/routes.config';
import { timerCommands } from '@/features/timer/services/timerCommands';
import { useTimerStore } from '@/stores/timer.store';

const DEFAULT_METHOD_ID = 1;

/** Reacts to tray menu intents. Main window only. */
export function useTrayBridge(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauri()) return;
    const subs: Promise<UnlistenFn>[] = [
      listen(EVENTS.trayTimerToggle, () => {
        const s = useTimerStore.getState().snapshot;
        if (s.status === 'running') void timerCommands.pause();
        else if (s.status === 'paused') void timerCommands.resume();
        else void timerCommands.start(DEFAULT_METHOD_ID);
      }),
      listen(EVENTS.trayQuickAdd, () => navigate(ROUTES.tasks)),
    ];
    return () => {
      subs.forEach((s) => void s.then((u) => u()));
    };
  }, [navigate]);
}
