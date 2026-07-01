import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, type SessionRow } from '@/db/schema';
import { nowMs, todayLocalDay } from '@/db/time';

export interface NewRunningSession {
  studyMethodId: number | null;
  taskId: number | null;
  methodKind: SessionRow['methodKind'];
  timerName: string | null;
  protocolJson: string;
  targetSeconds: number | null;
}

export const sessionsRepo = {
  async insertRunning(input: NewRunningSession): Promise<SessionRow> {
    const now = nowMs();
    const rows = await db
      .insert(sessions)
      .values({
        studyMethodId: input.studyMethodId,
        taskId: input.taskId,
        methodKind: input.methodKind,
        timerName: input.timerName,
        status: 'running',
        startedAt: now,
        localDay: todayLocalDay(),
        accumulatedMs: 0,
        runningSinceUtc: now,
        lastTickAt: now,
        protocolJson: input.protocolJson,
        blockIndex: 0,
        focusSeconds: 0,
        breakSeconds: 0,
        completedCycles: 0,
        targetSeconds: input.targetSeconds,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insertRunning: no row returned');
    return row;
  },

  async update(id: number, patch: Partial<SessionRow>): Promise<void> {
    await db.update(sessions).set({ ...patch, updatedAt: nowMs() }).where(eq(sessions.id, id));
  },

  /** Heartbeat: cheap liveness write while running. */
  async heartbeat(id: number, at: number): Promise<void> {
    await db.update(sessions).set({ lastTickAt: at }).where(eq(sessions.id, id));
  },

  async findActive(): Promise<SessionRow | null> {
    const rows = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.status, ['running', 'paused']))
      .orderBy(desc(sessions.startedAt))
      .limit(1);
    return rows[0] ?? null;
  },
};
