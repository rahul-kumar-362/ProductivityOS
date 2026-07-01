import { useEffect } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { notify } from '@/services/notifications.service';

/** Fires native notifications on timer milestones. Main window only. */
export function useTimerNotifications(): void {
  useEffect(() => {
    if (!isTauri()) return;
    const subs: Promise<UnlistenFn>[] = [
      listen(EVENTS.timerFinished, () => void notify('Session complete', 'Nice work — session finished.')),
      listen<{ kind: string }>(EVENTS.timerBlockComplete, (p) => {
        if (p.kind === 'focus') void notify('Focus block done', 'Time for a break.');
        else void notify('Break over', 'Back to focus.');
      }),
    ];
    return () => {
      subs.forEach((s) => void s.then((u) => u()));
    };
  }, []);
}
