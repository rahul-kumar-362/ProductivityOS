/**
 * day_rollup: materialized per-day summary that powers the calendar color and
 * analytics. Recomputed whenever a task on that day changes or a session ends —
 * every task/session mutation must funnel through here (see docs/design/data-model.md).
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tasks, sessions, dayRollup, type DayColor, type DayRollupRow } from '@/db/schema';
import { nowMs } from '@/db/time';

export async function recomputeDay(localDay: string): Promise<void> {
  const taskAgg = await db
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`coalesce(sum(case when ${tasks.status} = 'completed' then 1 else 0 end), 0)`,
    })
    .from(tasks)
    .where(and(eq(tasks.localDay, localDay), isNull(tasks.deletedAt)));

  const sessAgg = await db
    .select({
      focus: sql<number>`coalesce(sum(${sessions.focusSeconds}), 0)`,
      brk: sql<number>`coalesce(sum(${sessions.breakSeconds}), 0)`,
      cnt: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(and(eq(sessions.localDay, localDay), inArray(sessions.status, ['completed', 'recovered'])));

  const total = Number(taskAgg[0]?.total ?? 0);
  const done = Number(taskAgg[0]?.done ?? 0);
  const focus = Number(sessAgg[0]?.focus ?? 0);
  const brk = Number(sessAgg[0]?.brk ?? 0);
  const cnt = Number(sessAgg[0]?.cnt ?? 0);

  const color: DayColor =
    total === 0 && cnt === 0
      ? 'none'
      : total > 0 && done === 0
        ? 'red'
        : total > 0 && done === total
          ? 'green'
          : total > 0
            ? 'yellow'
            : 'none';

  const now = nowMs();
  await db
    .insert(dayRollup)
    .values({
      localDay,
      tasksTotal: total,
      tasksCompleted: done,
      focusSeconds: focus,
      breakSeconds: brk,
      sessionCount: cnt,
      color,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dayRollup.localDay,
      set: {
        tasksTotal: total,
        tasksCompleted: done,
        focusSeconds: focus,
        breakSeconds: brk,
        sessionCount: cnt,
        color,
        updatedAt: now,
      },
    });
}

export const dayRollupRepo = {
  async get(localDay: string): Promise<DayRollupRow | null> {
    const rows = await db.select().from(dayRollup).where(eq(dayRollup.localDay, localDay)).limit(1);
    return rows[0] ?? null;
  },
  getRange: (start: string, end: string): Promise<DayRollupRow[]> =>
    db
      .select()
      .from(dayRollup)
      .where(and(gte(dayRollup.localDay, start), lte(dayRollup.localDay, end))),
};
