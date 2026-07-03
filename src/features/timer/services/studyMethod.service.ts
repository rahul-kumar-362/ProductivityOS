/**
 * Study-method business logic. Validates a minutes-based draft and returns a
 * Result (matching the app's service pattern). The engine (buildProtocol) is
 * already method-agnostic, so user methods are just `custom` (interval) or
 * `flowtime` (count-up) rows — no engine changes needed.
 */
import { studyMethodsRepo, type StudyMethodInput } from '@/db/repositories/studyMethods.repo';
import type { StudyMethodKind, StudyMethodRow } from '@/db/schema';
import { TIMER } from '@/config/timer.config';
import { ok, err, tryResult, type Result } from '@/shared/lib/result';

export type CustomMethodKind = Extract<StudyMethodKind, 'custom' | 'flowtime'>;

export interface CustomMethodDraft {
  name: string;
  kind: CustomMethodKind;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  autoStartNextFocus: boolean;
}

const { minCustomMinutes: MIN, maxCustomMinutes: MAX } = TIMER;
const invalid = (message: string) => err({ code: 'VALIDATION', message });

function validate(d: CustomMethodDraft): Result<StudyMethodInput> {
  const name = d.name.trim();
  if (!name) return invalid('Name is required.');
  if (name.length > 40) return invalid('Name must be 40 characters or fewer.');

  if (d.kind === 'flowtime') {
    // Count-up: durations are nominal (engine ignores them for flowtime).
    return ok({
      name,
      kind: 'flowtime',
      focusSeconds: 1500,
      shortBreakSeconds: 300,
      longBreakSeconds: 300,
      cyclesBeforeLongBreak: 1,
      autoStartBreak: false,
      autoStartNextFocus: false,
      targetSeconds: null,
    });
  }

  const inRange = (m: number) => Number.isFinite(m) && m >= MIN && m <= MAX;
  if (!inRange(d.focusMinutes)) return invalid(`Focus must be ${MIN}-${MAX} minutes.`);
  if (!inRange(d.shortBreakMinutes)) return invalid(`Short break must be ${MIN}-${MAX} minutes.`);
  if (!inRange(d.longBreakMinutes)) return invalid(`Long break must be ${MIN}-${MAX} minutes.`);
  const cycles = Math.round(d.cyclesBeforeLongBreak);
  if (!Number.isFinite(cycles) || cycles < 1 || cycles > 12) return invalid('Cycles must be 1-12.');

  // Store whole-minute durations so a later edit round-trips exactly (no drift).
  return ok({
    name,
    kind: 'custom',
    focusSeconds: Math.round(d.focusMinutes) * 60,
    shortBreakSeconds: Math.round(d.shortBreakMinutes) * 60,
    longBreakSeconds: Math.round(d.longBreakMinutes) * 60,
    cyclesBeforeLongBreak: cycles,
    autoStartBreak: d.autoStartBreak,
    autoStartNextFocus: d.autoStartNextFocus,
    targetSeconds: null,
  });
}

export const studyMethodService = {
  async create(d: CustomMethodDraft): Promise<Result<StudyMethodRow>> {
    const r = validate(d);
    if (!r.ok) return r;
    return tryResult(() => studyMethodsRepo.create(r.value), 'STUDY_METHOD_CREATE');
  },
  async update(id: number, d: CustomMethodDraft): Promise<Result<StudyMethodRow>> {
    const r = validate(d);
    if (!r.ok) return r;
    return tryResult(() => studyMethodsRepo.update(id, r.value), 'STUDY_METHOD_UPDATE');
  },
  async remove(id: number): Promise<Result<void>> {
    return tryResult(() => studyMethodsRepo.archive(id), 'STUDY_METHOD_ARCHIVE');
  },
};
