import { create } from 'zustand';
import { IDLE_SNAPSHOT, type TimerSnapshot } from '@/features/timer/domain/types';

/**
 * Read-cache of the authoritative engine state (SQLite is the source of truth).
 * `setSnapshot` is called ONLY by the event subscription — never by components.
 */
interface TimerStore {
  snapshot: TimerSnapshot;
  hydrated: boolean;
  setSnapshot: (s: TimerSnapshot) => void;
}

export const useTimerStore = create<TimerStore>((set) => ({
  snapshot: IDLE_SNAPSHOT,
  hydrated: false,
  setSnapshot: (snapshot) => set({ snapshot, hydrated: true }),
}));
