import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tasks, taskEvents, type TaskEventType, type TaskRow } from '@/db/schema';
import { nowMs } from '@/db/time';

async function logEvent(
  taskId: number,
  type: TaskEventType,
  localDay: string,
  payload?: unknown,
): Promise<void> {
  const now = nowMs();
  await db.insert(taskEvents).values({
    taskId,
    type,
    localDay,
    at: now,
    payload: payload === undefined ? null : JSON.stringify(payload),
    createdAt: now,
    updatedAt: now,
  });
}

export const tasksRepo = {
  listByDay: (localDay: string): Promise<TaskRow[]> =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.localDay, localDay), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),

  listPending: (): Promise<TaskRow[]> =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'pending'), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.localDay), asc(tasks.sortOrder), asc(tasks.createdAt)),

  listCompleted: (limit = 100): Promise<TaskRow[]> =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'completed'), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.completedAt))
      .limit(limit),

  async create(input: { title: string; localDay: string; priority?: number }): Promise<TaskRow> {
    const now = nowMs();
    const rows = await db
      .insert(tasks)
      .values({
        title: input.title,
        status: 'pending',
        localDay: input.localDay,
        priority: input.priority ?? 0,
        sortOrder: now, // append order; monotonic
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('tasksRepo.create: no row');
    await logEvent(row.id, 'created', row.localDay, { title: row.title });
    return row;
  },

  async setDone(id: number, done: boolean): Promise<TaskRow> {
    const now = nowMs();
    const rows = await db
      .update(tasks)
      .set({ status: done ? 'completed' : 'pending', completedAt: done ? now : null, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('tasksRepo.setDone: no row');
    await logEvent(row.id, done ? 'completed' : 'uncompleted', row.localDay);
    return row;
  },

  async rename(id: number, title: string): Promise<TaskRow> {
    const rows = await db
      .update(tasks)
      .set({ title, updatedAt: nowMs() })
      .where(eq(tasks.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('tasksRepo.rename: no row');
    await logEvent(row.id, 'edited', row.localDay, { title });
    return row;
  },

  async softDelete(id: number): Promise<TaskRow> {
    const now = nowMs();
    const rows = await db
      .update(tasks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('tasksRepo.softDelete: no row');
    await logEvent(row.id, 'deleted', row.localDay);
    return row;
  },

  /** Add focus seconds worked on a task (atomic increment). */
  async addSpent(id: number, deltaSeconds: number): Promise<void> {
    if (deltaSeconds <= 0) return;
    await db
      .update(tasks)
      .set({ spentSeconds: sql`${tasks.spentSeconds} + ${deltaSeconds}`, updatedAt: nowMs() })
      .where(eq(tasks.id, id));
  },

  /** Set (or clear, when minutes <= 0) the task's time estimate. */
  async setEstimate(id: number, minutes: number): Promise<TaskRow> {
    const rows = await db
      .update(tasks)
      .set({ estimateMinutes: minutes > 0 ? Math.round(minutes) : null, updatedAt: nowMs() })
      .where(eq(tasks.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('tasksRepo.setEstimate: no row');
    return row;
  },
};
