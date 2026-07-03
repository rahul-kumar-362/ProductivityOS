import { useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { settingsRepo } from '@/db/repositories/settings.repo';

/**
 * The user's default study method (used by the floating timer's Start button).
 * The floating window is persistent (hidden/shown, never rebuilt), so it never
 * remounts — we re-read on a `settings://changed` broadcast so a default picked
 * in the main-window Settings propagates without an app restart.
 */
export function useDefaultMethodId(): number {
  const [id, setId] = useState(1);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    const read = () =>
      settingsRepo
        .getNumber('defaultMethodId', 1)
        .then((v) => {
          if (alive) setId(v);
        })
        .catch(() => {});
    void read();
    void listen(EVENTS.settingsChanged, () => void read()).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return id;
}
