import { useEffect, useState } from 'react';
import { useTimerStore } from '@/stores/timer.store';
import { TIMER } from '@/config/timer.config';
import { blockRemainingMs, currentBlock, deriveBlockElapsedMs } from '../domain/protocol';
import type { Block, TimerSnapshot } from '../domain/types';

export interface DerivedElapsed {
  snapshot: TimerSnapshot;
  block: Block | null;
  blockElapsedMs: number;
  remainingMs: number | null;
  isCountUp: boolean;
  displayMs: number;
}

/**
 * Display-only derivation. Ticks locally (cosmetic) while running; the anchor in
 * the snapshot is the truth, so a throttled/late tick self-corrects instantly.
 */
export function useDerivedElapsed(): DerivedElapsed {
  const snapshot = useTimerStore((s) => s.snapshot);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (snapshot.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), TIMER.displayTickMs);
    return () => clearInterval(id);
  }, [snapshot.status]);

  const block = currentBlock(snapshot);
  const blockElapsedMs = deriveBlockElapsedMs(snapshot.accumulatedMs, snapshot.runningSinceUtc, now);
  const remainingMs = blockRemainingMs(block, blockElapsedMs);
  const isCountUp = !block || block.durationMs === null;
  const displayMs = isCountUp ? blockElapsedMs : (remainingMs ?? 0);

  return { snapshot, block, blockElapsedMs, remainingMs, isCountUp, displayMs };
}
