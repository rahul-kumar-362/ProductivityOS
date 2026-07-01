import { describe, expect, it } from 'vitest';
import {
  blockRemainingMs,
  buildProtocol,
  decideRecovery,
  deriveBlockElapsedMs,
  isBlockComplete,
  type MethodConfig,
} from './protocol';

const method = (over: Partial<MethodConfig>): MethodConfig => ({
  kind: 'pomodoro',
  focusSeconds: 1500,
  shortBreakSeconds: 300,
  longBreakSeconds: 900,
  cyclesBeforeLongBreak: 4,
  targetSeconds: null,
  ...over,
});

describe('buildProtocol', () => {
  it('expands pomodoro to N focus + (N-1) short breaks + 1 long break', () => {
    const p = buildProtocol(method({ kind: 'pomodoro', cyclesBeforeLongBreak: 4 }));
    expect(p).toHaveLength(8);
    expect(p.filter((b) => b.kind === 'focus')).toHaveLength(4);
    expect(p.filter((b) => b.kind === 'break')).toHaveLength(3);
    expect(p.filter((b) => b.kind === 'longBreak')).toHaveLength(1);
    expect(p[p.length - 1]?.kind).toBe('longBreak');
  });

  it('deep work is a single count-down focus block sized by target', () => {
    const p = buildProtocol(method({ kind: 'deep_work', targetSeconds: 5400 }));
    expect(p).toHaveLength(1);
    expect(p[0]?.kind).toBe('focus');
    expect(p[0]?.durationMs).toBe(5400_000);
  });

  it('52/17 is focus then break', () => {
    const p = buildProtocol(method({ kind: 'fifty_two_seventeen', focusSeconds: 3120, shortBreakSeconds: 1020 }));
    expect(p.map((b) => b.kind)).toEqual(['focus', 'break']);
    expect(p[0]?.durationMs).toBe(3120_000);
    expect(p[1]?.durationMs).toBe(1020_000);
  });

  it('flowtime is a single open-ended count-up block', () => {
    const p = buildProtocol(method({ kind: 'flowtime' }));
    expect(p).toHaveLength(1);
    expect(p[0]?.durationMs).toBeNull();
  });
});

describe('deriveBlockElapsedMs', () => {
  it('adds live time while running', () => {
    expect(deriveBlockElapsedMs(1000, 10_000, 15_000)).toBe(6000); // 1000 + (15000-10000)
  });
  it('returns only banked ms when paused (no anchor)', () => {
    expect(deriveBlockElapsedMs(4200, null, 99_999)).toBe(4200);
  });
  it('clamps to banked on a backward clock jump (never negative live)', () => {
    expect(deriveBlockElapsedMs(4200, 20_000, 10_000)).toBe(4200);
  });
});

describe('block remaining / complete', () => {
  const cd = { id: 'x', kind: 'focus' as const, durationMs: 5000 };
  const cu = { id: 'y', kind: 'focus' as const, durationMs: null };
  it('count-down remaining is clamped >=0', () => {
    expect(blockRemainingMs(cd, 3000)).toBe(2000);
    expect(blockRemainingMs(cd, 6000)).toBe(0);
  });
  it('count-up has no remaining', () => {
    expect(blockRemainingMs(cu, 3000)).toBeNull();
  });
  it('isBlockComplete only for count-down past duration', () => {
    expect(isBlockComplete(cd, 4999)).toBe(false);
    expect(isBlockComplete(cd, 5000)).toBe(true);
    expect(isBlockComplete(cu, 999_999)).toBe(false);
  });
});

describe('decideRecovery', () => {
  const cfg = { recoveryLiveThresholdMs: 90_000, maxRecoverableMs: 5 * 60_000 };

  it('paused sessions restore untouched', () => {
    const r = decideRecovery(
      { status: 'paused', accumulatedMs: 1234, runningSinceUtc: null, lastTickAt: 1, startedAt: 0, now: 999 },
      cfg,
    );
    expect(r).toEqual({ status: 'paused', accumulatedMs: 1234, finalize: false });
  });

  it('short gap restores paused, crediting only known-alive segment time', () => {
    // ran from 10_000 to last heartbeat 40_000 => 30s alive; crash, now 50_000 (10s gap)
    const r = decideRecovery(
      { status: 'running', accumulatedMs: 5000, runningSinceUtc: 10_000, lastTickAt: 40_000, startedAt: 10_000, now: 50_000 },
      cfg,
    );
    expect(r.status).toBe('paused');
    expect(r.finalize).toBe(false);
    expect(r.accumulatedMs).toBe(5000 + 30_000);
  });

  it('long gap since last heartbeat finalizes as completed', () => {
    const r = decideRecovery(
      { status: 'running', accumulatedMs: 0, runningSinceUtc: 10_000, lastTickAt: 40_000, startedAt: 10_000, now: 40_000 + 10 * 60_000 },
      cfg,
    );
    expect(r.status).toBe('completed');
    expect(r.finalize).toBe(true);
  });

  it('clamps credited known-alive time to maxRecoverableMs', () => {
    // 30 min alive, clamp to 5 min
    const r = decideRecovery(
      { status: 'running', accumulatedMs: 0, runningSinceUtc: 0, lastTickAt: 30 * 60_000, startedAt: 0, now: 30 * 60_000 + 1000 },
      cfg,
    );
    expect(r.accumulatedMs).toBe(5 * 60_000);
  });
});
