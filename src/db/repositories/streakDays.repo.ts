import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { streakDays } from '@/db/schema';
import { nowMs } from '@/db/time';

export type StreakDayRow = typeof streakDays.$inferSelect;

export const streakDaysRepo = {
  listRestored: (): Promise<StreakDayRow[]> =>
    db.select().from(streakDays).where(eq(streakDays.restored, true)),

  async addRestore(localDay: string): Promise<void> {
    const now = nowMs();
    await db
      .insert(streakDays)
      .values({
        localDay,
        qualified: true,
        restored: true,
        restoredAt: now,
        tasksCompleted: 0,
        focusSeconds: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: streakDays.localDay,
        set: { restored: true, qualified: true, restoredAt: now, updatedAt: now },
      });
  },
};
