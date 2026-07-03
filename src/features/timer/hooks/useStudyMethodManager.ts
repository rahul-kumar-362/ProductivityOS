import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@/services/tauri';
import { studyMethodsRepo } from '@/db/repositories/studyMethods.repo';
import { studyMethodService, type CustomMethodDraft } from '../services/studyMethod.service';
import type { StudyMethodRow } from '@/db/schema';

/** List + create/update/remove active study methods, with reload. Used by Settings. */
export function useStudyMethodManager() {
  const [methods, setMethods] = useState<StudyMethodRow[]>([]);

  const reload = useCallback(async () => {
    if (!isTauri()) return;
    setMethods(await studyMethodsRepo.listActive());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (d: CustomMethodDraft) => {
      const r = await studyMethodService.create(d);
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );
  const update = useCallback(
    async (id: number, d: CustomMethodDraft) => {
      const r = await studyMethodService.update(id, d);
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );
  const remove = useCallback(
    async (id: number) => {
      const r = await studyMethodService.remove(id);
      if (r.ok) await reload();
      return r;
    },
    [reload],
  );

  return { methods, create, update, remove, reload };
}
