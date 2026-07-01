import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { streakState } from '@/db/schema';
import { nowMs } from '@/db/time';

export type StreakStateRow = typeof streakState.$inferSelect;

export const streakStateRepo = {
  async read(): Promise<StreakStateRow | null> {
    const rows = await db.select().from(streakState).where(eq(streakState.id, 1)).limit(1);
    return rows[0] ?? null;
  },

  async upsert(p: {
    currentStreak: number;
    longestStreak: number;
    lastQualifiedDay: string | null;
  }): Promise<void> {
    const now = nowMs();
    await db
      .insert(streakState)
      .values({
        id: 1,
        currentStreak: p.currentStreak,
        longestStreak: p.longestStreak,
        lastQualifiedDay: p.lastQualifiedDay,
        restoresUsed: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: streakState.id,
        set: {
          currentStreak: p.currentStreak,
          longestStreak: p.longestStreak,
          lastQualifiedDay: p.lastQualifiedDay,
          updatedAt: now,
        },
      });
  },

  async incrementRestore(): Promise<void> {
    const s = await streakStateRepo.read();
    await db
      .update(streakState)
      .set({ restoresUsed: (s?.restoresUsed ?? 0) + 1, updatedAt: nowMs() })
      .where(eq(streakState.id, 1));
  },
};
