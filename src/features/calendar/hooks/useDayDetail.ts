import { useEffect, useState } from 'react';
import { isTauri } from '@/services/tauri';
import { taskService } from '@/features/tasks/services/task.service';
import { dayRollupRepo } from '@/db/repositories/dayRollup.repo';
import type { DayRollupRow, TaskRow } from '@/db/schema';

export function useDayDetail(day: string) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [rollup, setRollup] = useState<DayRollupRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([taskService.listByDay(day), dayRollupRepo.get(day)])
      .then(([tr, ro]) => {
        if (!alive) return;
        if (tr.ok) setTasks(tr.value);
        setRollup(ro);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [day]);

  return { tasks, rollup, loading };
}
