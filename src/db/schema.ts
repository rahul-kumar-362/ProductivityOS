/**
 * ProductivityOS SQLite schema (Drizzle ORM).
 *
 * Conventions (see docs/design/data-model.md):
 *  - All instants are UTC epoch-milliseconds in INTEGER columns (mode:'number').
 *  - Every day-scoped feature stores a frozen `local_day` TEXT (YYYY-MM-DD),
 *    computed once at write time from local wall clock (timezone-drift-proof).
 *  - Enums = TEXT + $type<Union>() + CHECK constraint. Booleans = integer 0/1.
 *  - Single user: no users/workspaces tables.
 */
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  integer,
  text,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';

/* Shared timestamp columns (epoch-ms UTC, set by the repository layer). */
const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};

/* ---- Shared union types (also used across the app layer) ---- */
export type StudyMethodKind =
  | 'pomodoro'
  | 'flowtime'
  | 'deep_work'
  | 'fifty_two_seventeen'
  | 'custom';
export type SessionStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'abandoned'
  | 'recovered';
export type IntervalPhase = 'focus' | 'short_break' | 'long_break';
export type TaskStatus = 'pending' | 'completed';
export type TaskEventType =
  | 'created'
  | 'completed'
  | 'uncompleted'
  | 'edited'
  | 'deleted'
  | 'rescheduled';
export type DayColor = 'green' | 'yellow' | 'red' | 'none';
export type SettingType = 'string' | 'number' | 'boolean' | 'json';

/* ============================ study_methods ======================= */
export const studyMethods = sqliteTable(
  'study_methods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind').$type<StudyMethodKind>().notNull(),
    focusSeconds: integer('focus_seconds').notNull().default(1500),
    shortBreakSeconds: integer('short_break_seconds').notNull().default(300),
    longBreakSeconds: integer('long_break_seconds').notNull().default(900),
    cyclesBeforeLongBreak: integer('cycles_before_long_break').notNull().default(4),
    autoStartBreak: integer('auto_start_break', { mode: 'boolean' }).notNull().default(false),
    autoStartNextFocus: integer('auto_start_next_focus', { mode: 'boolean' })
      .notNull()
      .default(false),
    targetSeconds: integer('target_seconds'),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('idx_study_methods_kind').on(t.kind),
    check(
      'ck_study_methods_kind',
      sql`${t.kind} IN ('pomodoro','flowtime','deep_work','fifty_two_seventeen','custom')`,
    ),
    check('ck_study_methods_focus_pos', sql`${t.focusSeconds} > 0`),
  ],
);

/* ================================ timers ========================== */
export const timers = sqliteTable(
  'timers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#816EF7'),
    studyMethodId: integer('study_method_id').references(() => studyMethods.id, {
      onDelete: 'set null',
    }),
    targetSecondsOverride: integer('target_seconds_override'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('idx_timers_method').on(t.studyMethodId)],
);

/* =============================== sessions ========================= */
export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timerId: integer('timer_id').references(() => timers.id, { onDelete: 'set null' }),
    studyMethodId: integer('study_method_id').references(() => studyMethods.id, {
      onDelete: 'set null',
    }),
    taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    // Denormalized snapshots so history survives preset deletion/rename.
    timerName: text('timer_name'),
    methodKind: text('method_kind').$type<StudyMethodKind>(),

    status: text('status').$type<SessionStatus>().notNull().default('running'),

    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    localDay: text('local_day').notNull(),

    // Crash-safety + engine fields:
    // accumulatedMs = banked elapsed of the CURRENT block (reset each block boundary)
    accumulatedMs: integer('accumulated_ms').notNull().default(0),
    runningSinceUtc: integer('running_since_utc'), // origin of the live segment; null when paused
    lastTickAt: integer('last_tick_at'), // heartbeat (recovery liveness anchor)
    protocolJson: text('protocol_json'), // frozen Block[] at start
    blockIndex: integer('block_index').notNull().default(0),

    // Final rollups (seconds) for cheap analytics.
    focusSeconds: integer('focus_seconds').notNull().default(0),
    breakSeconds: integer('break_seconds').notNull().default(0),
    completedCycles: integer('completed_cycles').notNull().default(0),
    targetSeconds: integer('target_seconds'),

    interruptedCount: integer('interrupted_count').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    index('idx_sessions_local_day').on(t.localDay),
    index('idx_sessions_started_at').on(t.startedAt),
    index('idx_sessions_status').on(t.status),
    index('idx_sessions_active').on(t.status, t.lastTickAt),
    check(
      'ck_sessions_status',
      sql`${t.status} IN ('running','paused','completed','abandoned','recovered')`,
    ),
  ],
);

/* ========================= session_intervals ===================== */
export const sessionIntervals = sqliteTable(
  'session_intervals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    phase: text('phase').$type<IntervalPhase>().notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('idx_intervals_session').on(t.sessionId),
    check('ck_intervals_phase', sql`${t.phase} IN ('focus','short_break','long_break')`),
  ],
);

/* ================================ tasks =========================== */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status').$type<TaskStatus>().notNull().default('pending'),
    localDay: text('local_day').notNull(),
    completedAt: integer('completed_at'),
    priority: integer('priority').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    estimateMinutes: integer('estimate_minutes'),
    spentSeconds: integer('spent_seconds').notNull().default(0),
    deletedAt: integer('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('idx_tasks_local_day').on(t.localDay),
    index('idx_tasks_status_day').on(t.status, t.localDay),
    index('idx_tasks_deleted').on(t.deletedAt),
    check('ck_tasks_status', sql`${t.status} IN ('pending','completed')`),
  ],
);

/* ============================= task_events ======================= */
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').$type<TaskEventType>().notNull(),
    localDay: text('local_day').notNull(),
    at: integer('at').notNull(),
    payload: text('payload'),
    ...timestamps,
  },
  (t) => [
    index('idx_task_events_task').on(t.taskId),
    index('idx_task_events_day').on(t.localDay),
    index('idx_task_events_at').on(t.at),
    check(
      'ck_task_events_type',
      sql`${t.type} IN ('created','completed','uncompleted','edited','deleted','rescheduled')`,
    ),
  ],
);

/* ============================= daily_notes ======================= */
export const dailyNotes = sqliteTable(
  'daily_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    localDay: text('local_day').notNull(),
    content: text('content').notNull().default(''),
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_daily_notes_day').on(t.localDay)],
);

/* ============================ streak_state ======================= */
export const streakState = sqliteTable('streak_state', {
  id: integer('id').primaryKey(), // always 1
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastQualifiedDay: text('last_qualified_day'),
  restoresUsed: integer('restores_used').notNull().default(0),
  ...timestamps,
});

/* ============================= streak_days ======================= */
export const streakDays = sqliteTable(
  'streak_days',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    localDay: text('local_day').notNull(),
    qualified: integer('qualified', { mode: 'boolean' }).notNull().default(true),
    restored: integer('restored', { mode: 'boolean' }).notNull().default(false),
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    focusSeconds: integer('focus_seconds').notNull().default(0),
    restoredAt: integer('restored_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_streak_days_day').on(t.localDay)],
);

/* ============================= day_rollup ======================== */
export const dayRollup = sqliteTable(
  'day_rollup',
  {
    localDay: text('local_day').primaryKey(),
    tasksTotal: integer('tasks_total').notNull().default(0),
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    focusSeconds: integer('focus_seconds').notNull().default(0),
    breakSeconds: integer('break_seconds').notNull().default(0),
    sessionCount: integer('session_count').notNull().default(0),
    color: text('color').$type<DayColor>().notNull().default('none'),
    ...timestamps,
  },
  (t) => [check('ck_day_rollup_color', sql`${t.color} IN ('green','yellow','red','none')`)],
);

/* =============================== settings ======================== */
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    type: text('type').$type<SettingType>().notNull().default('string'),
    ...timestamps,
  },
  (t) => [check('ck_settings_type', sql`${t.type} IN ('string','number','boolean','json')`)],
);

/* ---- Inferred row types for the app layer ---- */
export type StudyMethodRow = typeof studyMethods.$inferSelect;
export type TimerRow = typeof timers.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type DailyNoteRow = typeof dailyNotes.$inferSelect;
export type DayRollupRow = typeof dayRollup.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
