import { useCallback, useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { taskService } from '../services/task.service';
import type { TaskRow } from '@/db/schema';
import type { Result } from '@/shared/lib/result';

/** Generic task list view (pending / completed) with mutation ops + reload. */
export function useTaskQuery(fetcher: () => Promise<Result<TaskRow[]>>) {
  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await fetcher();
    if (r.ok) setItems(r.value);
    setLoading(false);
  }, [fetcher]);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listen(EVENTS.statsChanged, () => void reload()).then((u) => {
      if (!alive) u();
      else unlisten = u;
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [reload]);

  const toggle = useCallback(
    async (t: TaskRow) => {
      await taskService.toggle(t.id, t.status !== 'completed');
      await reload();
    },
    [reload],
  );
  const rename = useCallback(
    async (id: number, title: string) => {
      await taskService.rename(id, title);
      await reload();
    },
    [reload],
  );
  const remove = useCallback(
    async (id: number) => {
      await taskService.remove(id);
      await reload();
    },
    [reload],
  );

  const setEstimate = useCallback(
    async (id: number, minutes: number) => {
      await taskService.setEstimate(id, minutes);
      await reload();
    },
    [reload],
  );

  return { items, loading, toggle, rename, remove, setEstimate, reload };
}
