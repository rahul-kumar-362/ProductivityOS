import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { dailyNotes, type DailyNoteRow } from '@/db/schema';
import { nowMs } from '@/db/time';

export const dailyNotesRepo = {
  async getByDay(localDay: string): Promise<DailyNoteRow | null> {
    const rows = await db.select().from(dailyNotes).where(eq(dailyNotes.localDay, localDay)).limit(1);
    return rows[0] ?? null;
  },

  async upsert(localDay: string, content: string): Promise<void> {
    const now = nowMs();
    await db
      .insert(dailyNotes)
      .values({ localDay, content, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: dailyNotes.localDay, set: { content, updatedAt: now } });
  },
};
