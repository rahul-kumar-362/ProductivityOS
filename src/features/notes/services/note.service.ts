import { dailyNotesRepo } from '@/db/repositories/dailyNotes.repo';
import { tryResult, type Result } from '@/shared/lib/result';

export const noteService = {
  get: (day: string): Promise<Result<string>> =>
    tryResult(async () => {
      const r = await dailyNotesRepo.getByDay(day);
      return r?.content ?? '';
    }, 'NOTE_GET'),

  save: (day: string, content: string): Promise<Result<void>> =>
    tryResult(() => dailyNotesRepo.upsert(day, content), 'NOTE_SAVE'),
};
