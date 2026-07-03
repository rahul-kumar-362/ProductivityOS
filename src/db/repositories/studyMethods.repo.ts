import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { studyMethods, type StudyMethodKind, type StudyMethodRow } from '@/db/schema';
import { nowMs } from '@/db/time';

/** Fields needed to create/update a method row (durations already in seconds). */
export interface StudyMethodInput {
  name: string;
  kind: StudyMethodKind; // 'custom' | 'flowtime' for user-created methods
  focusSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  autoStartNextFocus: boolean;
  targetSeconds: number | null;
}

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

  async create(input: StudyMethodInput): Promise<StudyMethodRow> {
    const now = nowMs();
    const maxRow = await db
      .select({ m: sql<number>`COALESCE(MAX(${studyMethods.sortOrder}), -1)` })
      .from(studyMethods);
    const sortOrder = (maxRow[0]?.m ?? -1) + 1;
    const rows = await db
      .insert(studyMethods)
      .values({ ...input, isSystem: false, isArchived: false, sortOrder, createdAt: now, updatedAt: now })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('studyMethodsRepo.create: no row');
    return row;
  },

  /** Update a USER method. The is_system=false guard makes built-ins immutable. */
  async update(id: number, patch: Partial<StudyMethodInput>): Promise<StudyMethodRow> {
    const rows = await db
      .update(studyMethods)
      .set({ ...patch, updatedAt: nowMs() })
      .where(and(eq(studyMethods.id, id), eq(studyMethods.isSystem, false)))
      .returning();
    const row = rows[0];
    if (!row) throw new Error('studyMethodsRepo.update: missing or system-locked');
    return row;
  },

  /** Soft-delete a USER method (keeps history resolvable; listActive filters it out). */
  async archive(id: number): Promise<void> {
    await db
      .update(studyMethods)
      .set({ isArchived: true, updatedAt: nowMs() })
      .where(and(eq(studyMethods.id, id), eq(studyMethods.isSystem, false)));
  },
};
