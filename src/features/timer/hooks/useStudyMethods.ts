import { useEffect, useState } from 'react';
import { isTauri } from '@/services/tauri';
import { studyMethodsRepo } from '@/db/repositories/studyMethods.repo';
import type { StudyMethodRow } from '@/db/schema';

/** Loads active study methods (main window). */
export function useStudyMethods(): StudyMethodRow[] {
  const [methods, setMethods] = useState<StudyMethodRow[]>([]);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    studyMethodsRepo
      .listActive()
      .then((m) => {
        if (alive) setMethods(m);
      })
      .catch((e) => console.error('[useStudyMethods]', e));
    return () => {
      alive = false;
    };
  }, []);
  return methods;
}
