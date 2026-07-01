import type { StudyMethodKind } from '@/db/schema';

export type EngineStatus = 'idle' | 'running' | 'paused' | 'completed';
export type BlockKind = 'focus' | 'break' | 'longBreak';

/** A single timed step. durationMs === null => open-ended (count-up). */
export interface Block {
  id: string;
  kind: BlockKind;
  durationMs: number | null;
  label?: string;
}
export type Protocol = Block[];

/**
 * Broadcast payload: main-window engine -> all windows. The UI derives the
 * live elapsed locally from the anchor (never stores elapsed as state).
 * `accumulatedMs` is banked elapsed of the CURRENT block (reset each boundary).
 */
export interface TimerSnapshot {
  status: EngineStatus;
  sessionId: number | null;
  taskId: number | null;
  methodId: number | null;
  methodKind: StudyMethodKind | null;
  methodName: string | null;
  protocol: Protocol;
  blockIndex: number;
  accumulatedMs: number;
  runningSinceUtc: number | null;
}

export type TimerCommand =
  | { action: 'start'; methodId: number; taskId?: number | null }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'skip' }
  | { action: 'stop' };

export const IDLE_SNAPSHOT: TimerSnapshot = {
  status: 'idle',
  sessionId: null,
  taskId: null,
  methodId: null,
  methodKind: null,
  methodName: null,
  protocol: [],
  blockIndex: 0,
  accumulatedMs: 0,
  runningSinceUtc: null,
};
