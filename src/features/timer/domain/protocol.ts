/**
 * Pure timer domain logic — no I/O, no React, no Tauri. Unit-tested.
 * Everything is an ordered list of Blocks; study methods are just presets.
 */
import type { Block, BlockKind, Protocol, TimerSnapshot } from './types';
import type { StudyMethodKind } from '@/db/schema';

/** Minimal method shape needed to build a protocol (subset of StudyMethodRow). */
export interface MethodConfig {
  kind: StudyMethodKind;
  focusSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  cyclesBeforeLongBreak: number;
  targetSeconds: number | null;
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Math.floor(performance.now() * 1000)}-${Math.floor(Math.random() * 1e6)}`;

const focus = (durationMs: number | null, label?: string): Block => ({
  id: uid(),
  kind: 'focus',
  durationMs,
  label,
});
const brk = (durationMs: number, kind: Extract<BlockKind, 'break' | 'longBreak'> = 'break'): Block => ({
  id: uid(),
  kind,
  durationMs,
  label: kind === 'longBreak' ? 'Long break' : 'Break',
});

/** Expand a study method into a concrete Block[] (the frozen protocol at start). */
export function buildProtocol(m: MethodConfig): Protocol {
  switch (m.kind) {
    case 'flowtime':
      return [focus(null, 'Focus')];
    case 'deep_work':
      return [focus((m.targetSeconds ?? m.focusSeconds) * 1000, 'Deep Work')];
    case 'fifty_two_seventeen':
      return [focus(m.focusSeconds * 1000, 'Focus'), brk(m.shortBreakSeconds * 1000)];
    case 'pomodoro':
    case 'custom':
    default: {
      const cycles = Math.max(1, m.cyclesBeforeLongBreak);
      const blocks: Block[] = [];
      for (let i = 0; i < cycles; i++) {
        blocks.push(focus(m.focusSeconds * 1000, `Focus ${i + 1}`));
        if (i < cycles - 1) blocks.push(brk(m.shortBreakSeconds * 1000));
      }
      blocks.push(brk(m.longBreakSeconds * 1000, 'longBreak'));
      return blocks;
    }
  }
}

/** The single elapsed formula, used everywhere. Clamped >=0 (DST/backward-clock safe). */
export function deriveBlockElapsedMs(
  accumulatedMs: number,
  runningSinceUtc: number | null,
  now: number,
): number {
  const live = runningSinceUtc !== null ? Math.max(0, now - runningSinceUtc) : 0;
  return accumulatedMs + live;
}

export function currentBlock(snap: Pick<TimerSnapshot, 'protocol' | 'blockIndex'>): Block | null {
  return snap.protocol[snap.blockIndex] ?? null;
}

/** For count-down blocks: remaining ms (>=0). null for open-ended (count-up). */
export function blockRemainingMs(block: Block | null, blockElapsedMs: number): number | null {
  if (!block || block.durationMs === null) return null;
  return Math.max(0, block.durationMs - blockElapsedMs);
}

export function isBlockComplete(block: Block | null, blockElapsedMs: number): boolean {
  return !!block && block.durationMs !== null && blockElapsedMs >= block.durationMs;
}

/* ------------------------------ recovery ------------------------------ */

export interface RecoveryConfig {
  recoveryLiveThresholdMs: number;
  maxRecoverableMs: number;
}
export interface RecoveryInput {
  status: 'running' | 'paused';
  accumulatedMs: number;
  runningSinceUtc: number | null;
  lastTickAt: number | null;
  startedAt: number;
  now: number;
}
export interface RecoveryResult {
  /** paused = restore for user to resume; completed = finalize into history */
  status: 'paused' | 'completed';
  /** banked current-block elapsed after crediting known-alive time */
  accumulatedMs: number;
  finalize: boolean;
}

/**
 * Deterministic crash recovery. Credits only KNOWN-ALIVE segment time
 * (runningSince -> lastTickAt), clamped — never the unaccounted gap, so time is
 * never inflated. Gap since last heartbeat decides paused (short) vs finalize (long).
 */
export function decideRecovery(i: RecoveryInput, cfg: RecoveryConfig): RecoveryResult {
  if (i.status === 'paused') {
    return { status: 'paused', accumulatedMs: i.accumulatedMs, finalize: false };
  }
  const knownAliveEnd = i.lastTickAt ?? i.runningSinceUtc ?? i.startedAt;
  const knownAlive =
    i.runningSinceUtc !== null ? Math.max(0, knownAliveEnd - i.runningSinceUtc) : 0;
  const credited = Math.min(knownAlive, cfg.maxRecoverableMs);
  const accumulatedMs = i.accumulatedMs + credited;
  const gap = Math.max(0, i.now - knownAliveEnd);
  const finalize = gap > cfg.recoveryLiveThresholdMs;
  return { status: finalize ? 'completed' : 'paused', accumulatedMs, finalize };
}
