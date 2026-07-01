import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studyMethods, type StudyMethodRow } from '@/db/schema';

export const studyMethodsRepo = {
  listActive: (): Promise<StudyMethodRow[]> =>
    db
      .select()
      .from(studyMethods)
      .where(eq(studyMethods.isArchived, false))
      .orderBy(asc(studyMethods.sortOrder)),

  async getById(id: number): Promise<StudyMethodRow | null> {
    const rows = await db.select().from(studyMethods).where(eq(studyMethods.id, id)).limit(1);
    return rows[0] ?? null;
  },
};
