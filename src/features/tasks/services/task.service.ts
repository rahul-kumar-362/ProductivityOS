/**
 * Task business logic. Returns Result; recomputes the affected day's rollup
 * (calendar color) after every mutation. Components never call this directly —
 * they go through hooks.
 */
import { tasksRepo } from '@/db/repositories/tasks.repo';
import { recomputeDay } from '@/db/repositories/dayRollup.repo';
import { recomputeStreak } from '@/features/streaks/services/streak.service';
import { todayLocalDay } from '@/db/time';
import { err, tryResult, type Result } from '@/shared/lib/result';
import type { TaskRow } from '@/db/schema';

export const taskService = {
  listByDay: (localDay: string): Promise<Result<TaskRow[]>> =>
    tryResult(() => tasksRepo.listByDay(localDay), 'TASKS_LIST'),

  listPending: (): Promise<Result<TaskRow[]>> =>
    tryResult(() => tasksRepo.listPending(), 'TASKS_LIST'),

  listCompleted: (): Promise<Result<TaskRow[]>> =>
    tryResult(() => tasksRepo.listCompleted(), 'TASKS_LIST'),

  add(title: string, localDay: string = todayLocalDay()): Promise<Result<TaskRow>> {
    const clean = title.trim();
    if (!clean) return Promise.resolve(err({ code: 'EMPTY_TITLE' }));
    return tryResult(async () => {
      const row = await tasksRepo.create({ title: clean, localDay });
      await recomputeDay(localDay);
      await recomputeStreak();
      return row;
    }, 'TASKS_ADD');
  },

  toggle(id: number, done: boolean): Promise<Result<TaskRow>> {
    return tryResult(async () => {
      const row = await tasksRepo.setDone(id, done);
      await recomputeDay(row.localDay);
      await recomputeStreak();
      return row;
    }, 'TASKS_TOGGLE');
  },

  rename(id: number, title: string): Promise<Result<TaskRow>> {
    const clean = title.trim();
    if (!clean) return Promise.resolve(err({ code: 'EMPTY_TITLE' }));
    return tryResult(() => tasksRepo.rename(id, clean), 'TASKS_RENAME');
  },

  remove(id: number): Promise<Result<TaskRow>> {
    return tryResult(async () => {
      const row = await tasksRepo.softDelete(id);
      await recomputeDay(row.localDay);
      await recomputeStreak();
      return row;
    }, 'TASKS_REMOVE');
  },

  setEstimate(id: number, minutes: number): Promise<Result<TaskRow>> {
    return tryResult(() => tasksRepo.setEstimate(id, minutes), 'TASKS_ESTIMATE');
  },
};
