import { useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { streakService } from '../services/streak.service';
import type { StreakStateRow } from '@/db/repositories/streakState.repo';

/** Current/longest streak, refreshed live on `stats://changed`. */
export function useStreak(): StreakStateRow | null {
  const [state, setState] = useState<StreakStateRow | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    const load = () => {
      streakService
        .read()
        .then((s) => {
          if (alive) setState(s);
        })
        .catch(() => {});
    };
    load();
    void listen(EVENTS.statsChanged, load).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return state;
}
