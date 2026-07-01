import { useCallback, useEffect, useState } from 'react';
import { isTauri, listen } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { monthMatrix } from '@/shared/lib/date';
import { dayRollupRepo } from '@/db/repositories/dayRollup.repo';
import type { DayRollupRow } from '@/db/schema';

export function useCalendar(year: number, month: number) {
  const matrix = monthMatrix(year, month);
  const start = matrix[0]![0]!;
  const lastWeek = matrix[matrix.length - 1]!;
  const end = lastWeek[lastWeek.length - 1]!;

  const [rollups, setRollups] = useState<Record<string, DayRollupRow>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = await dayRollupRepo.getRange(start, end);
    const map: Record<string, DayRollupRow> = {};
    for (const r of rows) map[r.localDay] = r;
    setRollups(map);
    setLoading(false);
  }, [start, end]);

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

  return { matrix, rollups, loading, reload };
}
