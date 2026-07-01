/**
 * Streak service: recomputes current/longest from day_rollup facts + restored
 * days, and handles streak restore. Called after any task/session mutation
 * (same triggers as day_rollup recompute).
 */
import { addDays } from '@/shared/lib/date';
import { todayLocalDay } from '@/db/time';
import { dayRollupRepo } from '@/db/repositories/dayRollup.repo';
import { streakStateRepo, type StreakStateRow } from '@/db/repositories/streakState.repo';
import { streakDaysRepo } from '@/db/repositories/streakDays.repo';
import { settingsRepo } from '@/db/repositories/settings.repo';
import { computeStreaks, qualifiesDay } from '../domain/streak';
import { emit } from '@/services/tauri';
import { EVENTS } from '@/config/events.config';
import { err, ok, tryResult, type Result } from '@/shared/lib/result';

const HISTORY_DAYS = 400;

export async function recomputeStreak(): Promise<void> {
  const minFocus = await settingsRepo.getNumber('streakDailyMinFocusSeconds', 7200);
  const today = todayLocalDay();
  const start = addDays(today, -HISTORY_DAYS);

  const rollups = await dayRollupRepo.getRange(start, today);
  const restored = await streakDaysRepo.listRestored();

  const qualified = new Set<string>();
  for (const r of rollups) if (qualifiesDay(r, minFocus)) qualified.add(r.localDay);
  for (const r of restored) qualified.add(r.localDay);

  const arr = [...qualified].sort();
  const { current, longest } = computeStreaks(arr, today);
  const existing = await streakStateRepo.read();
  await streakStateRepo.upsert({
    currentStreak: current,
    longestStreak: Math.max(longest, existing?.longestStreak ?? 0),
    lastQualifiedDay: arr.length ? (arr[arr.length - 1] ?? null) : null,
  });
  void emit(EVENTS.statsChanged);
}

export const streakService = {
  read: (): Promise<StreakStateRow | null> => streakStateRepo.read(),
  recompute: recomputeStreak,

  /** Spend a restore to bridge a missed day. Allowance from settings. */
  restore(day: string): Promise<Result<void>> {
    return tryResult<void>(async () => {
      const allowance = await settingsRepo.getNumber('streakRestoresPerMonth', 1);
      const state = await streakStateRepo.read();
      if ((state?.restoresUsed ?? 0) >= allowance) {
        throw new Error('No streak restores remaining');
      }
      await streakDaysRepo.addRestore(day);
      await streakStateRepo.incrementRestore();
      await recomputeStreak();
    }, 'STREAK_RESTORE').then((r) => (r.ok ? ok(undefined) : err(r.error)));
  },
};
