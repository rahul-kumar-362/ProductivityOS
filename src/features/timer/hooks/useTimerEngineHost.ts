import { useEffect } from 'react';
import { isTauri } from '@/services/tauri';
import { timerEngine } from '../services/timerEngine';

/**
 * Boots the authoritative engine. Call ONCE, in the MAIN window only.
 * The engine is the sole SQLite writer and command handler.
 */
export function useTimerEngineHost(): void {
  useEffect(() => {
    if (!isTauri()) return;
    void timerEngine.init();
    return () => timerEngine.dispose();
  }, []);
}
