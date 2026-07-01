/**
 * Pure streak logic. A day "qualifies" if all its tasks are done OR enough focus
 * time was logged (configurable). Streak counting is timezone-safe via day keys.
 */
import { addDays } from '@/shared/lib/date';

export interface DayFacts {
  tasksTotal: number;
  tasksCompleted: number;
  focusSeconds: number;
}

export function qualifiesDay(f: DayFacts, minFocusSeconds: number): boolean {
  const allTasksDone = f.tasksTotal > 0 && f.tasksCompleted === f.tasksTotal;
  const enoughFocus = f.focusSeconds >= minFocusSeconds;
  return allTasksDone || enoughFocus;
}

/**
 * current = consecutive qualified days ending today (today not-yet-qualified does
 * NOT break the streak — it counts back from yesterday). longest = best run ever.
 */
export function computeStreaks(
  qualifiedDays: string[],
  today: string,
): { current: number; longest: number } {
  const set = new Set(qualifiedDays);

  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }

  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}
