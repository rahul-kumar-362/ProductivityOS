/**
 * Idempotent seed: built-in study methods, the streak_state singleton, and
 * default settings. Safe to run on every startup (onConflictDoNothing), so it
 * never clobbers user changes. Demonstrates the Drizzle WRITE path (M0 spike).
 */
import { db } from './client';
import { nowMs } from './time';
import { studyMethods, streakState, settings, type SettingType } from './schema';
import { STUDY_METHODS } from '@/config/timer.config';

/** System study methods get stable ids 1..4 so re-seeding is a no-op. */
async function seedStudyMethods(): Promise<void> {
  const now = nowMs();
  const rows = [
    { id: 1, ...STUDY_METHODS.pomodoro },
    { id: 2, ...STUDY_METHODS.fiftyTwoSeventeen },
    { id: 3, ...STUDY_METHODS.deepWork },
    { id: 4, ...STUDY_METHODS.flowtime },
  ];
  let sortOrder = 0;
  for (const r of rows) {
    await db
      .insert(studyMethods)
      .values({
        id: r.id,
        name: r.label,
        kind: r.kind,
        focusSeconds: r.focusSeconds,
        shortBreakSeconds: r.shortBreakSeconds,
        longBreakSeconds: r.longBreakSeconds,
        cyclesBeforeLongBreak: r.cyclesBeforeLongBreak,
        autoStartBreak: r.autoStartBreak,
        autoStartNextFocus: false,
        targetSeconds: 'targetSeconds' in r ? r.targetSeconds : null,
        isSystem: true,
        isArchived: false,
        sortOrder: sortOrder++,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: studyMethods.id });
  }
}

async function seedStreakState(): Promise<void> {
  const now = nowMs();
  await db
    .insert(streakState)
    .values({ id: 1, currentStreak: 0, longestStreak: 0, restoresUsed: 0, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: streakState.id });
}

/** Insert a default setting only if absent (never overwrites user value). */
async function seedSetting(key: string, value: unknown, type: SettingType): Promise<void> {
  const now = nowMs();
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value), type, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: settings.key });
}

async function seedSettings(): Promise<void> {
  await seedSetting('theme', 'dark', 'string');
  await seedSetting('floatOpacity', 0.9, 'number');
  await seedSetting('alwaysOnTop', true, 'boolean');
  await seedSetting('notificationsEnabled', true, 'boolean');
  await seedSetting('defaultMethodId', 1, 'number');
  await seedSetting('streakDailyMinFocusSeconds', 7200, 'number');
  await seedSetting('streakRestoresPerMonth', 1, 'number');
}

/** Run all seeders. Called once at startup after migrations. */
export async function runSeed(): Promise<void> {
  await seedStudyMethods();
  await seedStreakState();
  await seedSettings();
}
