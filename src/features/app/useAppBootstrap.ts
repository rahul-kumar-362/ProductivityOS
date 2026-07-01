import { useEffect } from 'react';
import { isTauri } from '@/services/tauri';
import { runSeed } from '@/db/seed';

/** One-time app startup work (main window): idempotent DB seed. */
export function useAppBootstrap(): void {
  useEffect(() => {
    if (!isTauri()) return;
    void runSeed().catch((e) => console.error('[bootstrap]', e));
  }, []);
}
