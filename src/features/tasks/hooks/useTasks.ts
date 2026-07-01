import { useCallback, useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { todayLocalDay } from '@/db/time';
import { taskService } from '../services/task.service';
import type { TaskRow } from '@/db/schema';
import type { Result } from '@/shared/lib/result';

/** Today's tasks with optimistic toggle. */
export function useTasks() {
  const day = todayLocalDay();
  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await taskService.listByDay(day);
    if (r.ok) setItems(r.value);
    setLoading(false);
  }, [day]);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    void reload();
  }, [reload]);

  // Refresh when a focus session credits a task (spent time / ring).
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

  const add = useCallback(
    async (title: string): Promise<Result<TaskRow>> => {
      const r = await taskService.add(title, day);
      if (r.ok) await reload();
      return r;
    },
    [day, reload],
  );

  const toggle = useCallback(
    async (t: TaskRow) => {
      setItems((prev) =>
        prev.map((x) =>
          x.id === t.id ? { ...x, status: x.status === 'completed' ? 'pending' : 'completed' } : x,
        ),
      );
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

  const pending = items.filter((t) => t.status === 'pending');
  const completed = items.filter((t) => t.status === 'completed');

  return { pending, completed, loading, add, toggle, rename, remove, setEstimate, reload };
}
