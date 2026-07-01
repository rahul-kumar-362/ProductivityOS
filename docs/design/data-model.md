# Design: data-model

> Complete Drizzle-over-SQLite schema for the single-user ProductivityOS MVP: 11 tables covering study methods, timers, sessions (crash-safe), tasks, task history/audit, daily notes, streak state, streak-restore log, day-rollup (calendar color) cache, and a key/value settings store. All timestamps are UTC epoch-milliseconds integers (`integer`, not Drizzle timestamp mode) so the Rust engine can persist ticks atomically for crash recovery, and a separate stored `local_day` (YYYY-MM-DD text) column drives calendar/streak logic without timezone drift. Migrations run via drizzle-kit generate + a Tauri-side migrate-on-startup runner. No users/workspaces tables — single user is assumed everywhere.

## Decisions

- All instants stored as UTC epoch-milliseconds in SQLite INTEGER columns using integer(name,{mode:'number'}) — NOT Drizzle {mode:'timestamp'} (which uses seconds + Date objects and loses ms precision needed for tick math)
- Every day-scoped feature stores a frozen local_day TEXT column (YYYY-MM-DD) computed once at write time from local wall-clock; calendar color, streaks, today's tasks, and daily-note uniqueness all key off local_day to avoid UTC off-by-one-day bugs (critical at UTC-3)
- 11 tables: study_methods, timers, sessions, session_intervals, tasks, task_events, daily_notes, streak_state (singleton id=1), streak_days, day_rollup, settings — no users/workspaces tables
- day_rollup is the analytics cache AND the calendar color source; recomputed by the data layer on every task/session write via upsert (onConflictDoUpdate) keyed on local_day PK
- Crash-safe session engine: sessions carry status + accumulated_ms + last_tick_at heartbeat; on startup, active sessions with a stale heartbeat (>90s) are marked 'recovered', crediting only banked focus, never the unaccounted gap
- Integer autoincrement PKs everywhere except settings (text key KV store) and day_rollup (natural local_day PK)
- Enums stored as TEXT with $type<Union>() + a SQLite CHECK constraint; booleans as integer {mode:'boolean'} 0/1
- FK cascade: session_intervals->sessions and task_events->tasks CASCADE; sessions/timers -> study_methods and sessions->timers SET NULL, with denormalized timer_name/method_kind snapshots so history survives preset deletion
- Tasks soft-delete (deleted_at); sessions and daily_notes never hard-deleted; timer/study_method presets hard-delete
- Migrations: drizzle-kit generate produces versioned SQL committed to repo; applied idempotently at Tauri startup (recommend Rust/rusqlite runner) with a file-copy backup before each migration since drizzle-kit has no down-migrations
- Pragmas set on every connection open: journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL, busy_timeout=5000
- Durations stored in whole seconds (integer) for analytics fields; the live running session's accumulated_ms is milliseconds for smooth tick math
- Single time module (src/db/time.ts: nowMs/toLocalDay/todayLocalDay) is the ONLY place Date is used; repositories set created_at/updated_at and local_day — no time logic or SQL in React components
- Seed idempotently after migration: 4 system study methods (Pomodoro, 52/17, Deep Work, Flowtime, is_system=1), streak_state row id=1, and default settings (theme=dark, timerOpacity, alwaysOnTop, window geometry, tray/notification prefs, monthly restore allowance)

# ProductivityOS — SQLite Data Model (Drizzle ORM)

## 0. Guiding decisions (locked)

1. **Single user, no tenancy.** No `users`, `workspaces`, or `owner_id` anywhere. Every row is implicitly "the developer's".
2. **All instants are UTC epoch-milliseconds stored as SQLite `INTEGER`.** Column type is `integer('...', { mode: 'number' })` — NOT Drizzle's `{ mode: 'timestamp' }` and NOT `text` ISO strings. Rationale in §5.
3. **Calendar/streak/"is this today" logic keys off a stored `local_day` text column (`YYYY-MM-DD`)**, computed once at write time from the user's local wall-clock, never re-derived from an epoch at read time. Rationale in §5.2.
4. **Every table gets `created_at` and `updated_at` (epoch-ms).** `updated_at` maintained by the repository layer (Zustand/data layer), not by SQLite triggers — keeps logic in TS, testable, no hidden magic.
5. **Integer autoincrement primary keys** (`integer primaryKey({ autoIncrement: true })`) for all app rows. Exception: `settings` uses a text `key` PK (KV store), and `day_rollup` uses `local_day` as a natural PK.
6. **Foreign keys ON with sensible cascade.** `PRAGMA foreign_keys = ON` set at connection open (SQLite defaults OFF). Deleting a timer preset does NOT delete its sessions (sessions denormalize what they need); deleting a task cascades its history.
7. **Booleans as integer 0/1** via `integer('...', { mode: 'boolean' })`.
8. **Enums as `text` with a Drizzle `$type<Union>()` cast + a CHECK constraint** — SQLite has no native enum. Keeps the column readable in a DB browser and type-safe in TS.
9. **Soft-delete only where history matters** (tasks use `deleted_at`; sessions/notes are never hard-deleted). Timer presets hard-delete.
10. **Money/precision:** N/A. Durations are stored in **whole seconds** (`integer`) except the live-tick `accumulated_ms` on the running session which is ms for smoothness.

---

## 1. Table inventory & feature mapping

| Table | Feature(s) it serves | Notes |
|---|---|---|
| `study_methods` | Study methods: Pomodoro, Flowtime, Deep Work, 52/17, custom protocol builder | Config presets. Ships with seeded system rows (`is_system=1`) that can't be deleted. |
| `timers` | Multiple named timer presets shown in the floating window | A timer *preset* (name, color, linked study method, default target). NOT the live running state. |
| `sessions` | Crash-safe timer/session engine + permanent session history + analytics (study hours) | The heart. One row per work session. Holds live `status` + `accumulated_ms` + `last_tick_at` for crash recovery. |
| `session_intervals` | Pomodoro/52-17 focus↔break cycle detail, deep analytics | Optional child rows: each focus/break phase within a session. Enables accurate "focused minutes vs break minutes". |
| `tasks` | Daily task mgmt: pending page, completed page | Soft-deleted. `local_day` = the day the task belongs to. |
| `task_events` | Task history page + calendar/analytics audit trail | Append-only log (created/completed/uncompleted/edited/deleted/rescheduled). Source of truth for "task history". |
| `daily_notes` | Daily notes (one markdown note per day, autosave) | Unique on `local_day`. Autosave updates `content` + `updated_at`. |
| `streak_state` | Streak system (current + longest) | Single-row table (id always = 1). Fast read for the always-on UI. |
| `streak_days` | Per-day streak ledger + streak-restore feature | One row per calendar day that counted (or was restored). Drives "restore a broken streak". |
| `day_rollup` | Monthly calendar color-coding (green/yellow/red) + analytics cache | Materialized per-day summary (tasks done/total, focus seconds, color). Recomputed on writes. |
| `settings` | Settings page, dark mode, opacity, window geometry, tray prefs | Typed KV store (`key`, `value` JSON text, `type`). |

Optional analytics cache: **`day_rollup` IS the analytics cache.** It doubles as (a) the calendar color source and (b) a pre-aggregated feed for Recharts, so a month view or a 90-day chart is one indexed range scan instead of N group-bys over `sessions`/`tasks`. Warranted because the calendar and dashboard are read on every app open and must feel instant.

---

## 2. Drizzle schema (actual TypeScript sketch)

> File: `src/db/schema.ts`. Uses `drizzle-orm/sqlite-core`. `sql` used for CHECK constraints and defaults. Timestamp helper avoids repetition.

```ts
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ *
 * Shared column helpers — every table gets these two timestamps.
 * epoch-ms UTC, populated by the data layer (see repositories).
 * ------------------------------------------------------------------ */
const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};

/* Union types shared with the app layer */
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
    // Protocol builder config: durations in SECONDS, plus cycle rules.
    focusSeconds: integer('focus_seconds').notNull().default(1500),      // 25m
    shortBreakSeconds: integer('short_break_seconds').notNull().default(300),  // 5m
    longBreakSeconds: integer('long_break_seconds').notNull().default(900),    // 15m
    cyclesBeforeLongBreak: integer('cycles_before_long_break').notNull().default(4),
    // Flowtime/Deep Work have no fixed break -> autoStartBreak=false, target optional.
    autoStartBreak: integer('auto_start_break', { mode: 'boolean' }).notNull().default(false),
    autoStartNextFocus: integer('auto_start_next_focus', { mode: 'boolean' }).notNull().default(false),
    // Optional daily/session target in seconds (Deep Work: e.g. 5400 = 90m).
    targetSeconds: integer('target_seconds'),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('idx_study_methods_kind').on(t.kind),
    check('ck_study_methods_kind', sql`${t.kind} IN
      ('pomodoro','flowtime','deep_work','fifty_two_seventeen','custom')`),
    check('ck_study_methods_focus_pos', sql`${t.focusSeconds} > 0`),
  ],
);

/* ================================ timers ========================== */
/* A reusable timer PRESET surfaced in the floating window.
   Live running state lives on `sessions`, not here. */
export const timers = sqliteTable(
  'timers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#7c5cff'), // hex, used for UI + calendar tint
    studyMethodId: integer('study_method_id').references(() => studyMethods.id, {
      onDelete: 'set null',
    }),
    // Optional per-timer override of the method target (seconds).
    targetSecondsOverride: integer('target_seconds_override'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('idx_timers_method').on(t.studyMethodId)],
);

/* =============================== sessions ========================= */
/* One row per work session. Crash-safe: status/accumulatedMs/lastTickAt
   let the Rust engine reconstruct state after a hard kill. Fields needed
   for history are denormalized so deleting a timer/method never orphans. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timerId: integer('timer_id').references(() => timers.id, { onDelete: 'set null' }),
    studyMethodId: integer('study_method_id').references(() => studyMethods.id, {
      onDelete: 'set null',
    }),
    // Denormalized snapshots (history survives preset deletion / rename).
    timerName: text('timer_name'),
    methodKind: text('method_kind').$type<StudyMethodKind>(),

    status: text('status').$type<SessionStatus>().notNull().default('running'),

    startedAt: integer('started_at').notNull(),   // epoch-ms UTC
    endedAt: integer('ended_at'),                 // null while active
    localDay: text('local_day').notNull(),        // YYYY-MM-DD of startedAt (local)

    // Crash-safety tick fields:
    accumulatedMs: integer('accumulated_ms').notNull().default(0), // focus time banked
    lastTickAt: integer('last_tick_at'),          // epoch-ms of last heartbeat write

    // Final rollups (seconds) written at completion for cheap analytics.
    focusSeconds: integer('focus_seconds').notNull().default(0),
    breakSeconds: integer('break_seconds').notNull().default(0),
    completedCycles: integer('completed_cycles').notNull().default(0),
    targetSeconds: integer('target_seconds'),     // snapshot of goal at start

    interruptedCount: integer('interrupted_count').notNull().default(0),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    index('idx_sessions_local_day').on(t.localDay),
    index('idx_sessions_started_at').on(t.startedAt),
    index('idx_sessions_status').on(t.status),
    // Fast lookup of the (at most one expected) active session on startup:
    index('idx_sessions_active').on(t.status, t.lastTickAt),
    check('ck_sessions_status', sql`${t.status} IN
      ('running','paused','completed','abandoned','recovered')`),
  ],
);

/* ========================= session_intervals ===================== */
/* Child phases of a session (focus / break). Optional but powering
   accurate cycle analytics and Pomodoro fidelity. */
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
    // The day this task belongs to (drives pending page + calendar).
    localDay: text('local_day').notNull(),
    completedAt: integer('completed_at'),          // epoch-ms, null while pending
    priority: integer('priority').notNull().default(0), // 0 normal,1 high,2 urgent
    sortOrder: integer('sort_order').notNull().default(0),
    // Optional link to a timer/session for "worked on this task".
    estimateMinutes: integer('estimate_minutes'),
    deletedAt: integer('deleted_at'),              // soft delete
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
/* Append-only audit log = "task history" page + calendar/analytics feed. */
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').$type<TaskEventType>().notNull(),
    localDay: text('local_day').notNull(),  // day the event occurred (local)
    at: integer('at').notNull(),            // epoch-ms UTC
    // small JSON blob for diffs (old/new title, reschedule from/to, etc.)
    payload: text('payload'),
    ...timestamps,
  },
  (t) => [
    index('idx_task_events_task').on(t.taskId),
    index('idx_task_events_day').on(t.localDay),
    index('idx_task_events_at').on(t.at),
    check('ck_task_events_type', sql`${t.type} IN
      ('created','completed','uncompleted','edited','deleted','rescheduled')`),
  ],
);

/* ============================= daily_notes ======================= */
export const dailyNotes = sqliteTable(
  'daily_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    localDay: text('local_day').notNull(),   // one note per day
    content: text('content').notNull().default(''), // markdown
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_daily_notes_day').on(t.localDay)],
);

/* ============================ streak_state ======================= */
/* Singleton row (id = 1). Read on every app open for the streak badge. */
export const streakState = sqliteTable('streak_state', {
  id: integer('id').primaryKey(), // always 1
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastQualifiedDay: text('last_qualified_day'),  // YYYY-MM-DD
  restoresUsed: integer('restores_used').notNull().default(0),
  ...timestamps,
});

/* ============================= streak_days ======================= */
/* Per-day ledger of streak qualification; supports restore feature. */
export const streakDays = sqliteTable(
  'streak_days',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    localDay: text('local_day').notNull(),
    // How the day earned its place in the streak.
    qualified: integer('qualified', { mode: 'boolean' }).notNull().default(true),
    restored: integer('restored', { mode: 'boolean' }).notNull().default(false),
    // Snapshot of why it qualified (tasks done + focus secs that day).
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    focusSeconds: integer('focus_seconds').notNull().default(0),
    restoredAt: integer('restored_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('uq_streak_days_day').on(t.localDay)],
);

/* ============================= day_rollup ======================== */
/* Materialized per-day summary. Powers calendar color + dashboard.
   Natural PK = local_day. Recomputed by the data layer on any write
   affecting that day (task complete, session end). */
export const dayRollup = sqliteTable(
  'day_rollup',
  {
    localDay: text('local_day').primaryKey(),   // YYYY-MM-DD
    tasksTotal: integer('tasks_total').notNull().default(0),
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    focusSeconds: integer('focus_seconds').notNull().default(0),
    breakSeconds: integer('break_seconds').notNull().default(0),
    sessionCount: integer('session_count').notNull().default(0),
    color: text('color').$type<DayColor>().notNull().default('none'),
    ...timestamps,
  },
  (t) => [
    check('ck_day_rollup_color', sql`${t.color} IN ('green','yellow','red','none')`),
  ],
);

/* =============================== settings ======================== */
/* Typed KV store: theme, opacity, window geometry, tray prefs, etc. */
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),                 // JSON-encoded
    type: text('type').$type<SettingType>().notNull().default('string'),
    ...timestamps,
  },
  (t) => [check('ck_settings_type', sql`${t.type} IN ('string','number','boolean','json')`)],
);
```

---

## 3. Relationships (Drizzle `relations`, optional but recommended)

```ts
import { relations } from 'drizzle-orm';

export const timersRelations = relations(timers, ({ one, many }) => ({
  studyMethod: one(studyMethods, {
    fields: [timers.studyMethodId], references: [studyMethods.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  timer: one(timers, { fields: [sessions.timerId], references: [timers.id] }),
  studyMethod: one(studyMethods, {
    fields: [sessions.studyMethodId], references: [studyMethods.id],
  }),
  intervals: many(sessionIntervals),
}));

export const tasksRelations = relations(tasks, ({ many }) => ({
  events: many(taskEvents),
}));
```

FK cascade summary:
- `session_intervals.session_id` -> `sessions.id` **CASCADE** (child data).
- `task_events.task_id` -> `tasks.id` **CASCADE** (audit dies with hard-deleted task; tasks are normally *soft*-deleted so history persists in practice).
- `sessions.timer_id` / `sessions.study_method_id` -> **SET NULL** (history outlives presets; denormalized `timerName`/`methodKind` preserve meaning).
- `timers.study_method_id` -> **SET NULL**.

---

## 4. Migration strategy (drizzle-kit)

**Config** — `drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  // dbCredentials not needed for generate; migrations are applied at runtime.
});
```

**Authoring flow (dev):**
1. Edit `schema.ts`.
2. `npx drizzle-kit generate` -> emits versioned SQL under `src/db/migrations/` (e.g. `0000_init.sql`) + `meta/_journal.json`.
3. Commit the generated SQL. **Never hand-edit applied migrations**; add a new one instead.

**Applying (runtime, on app startup):** Do NOT rely on `drizzle-kit migrate` (dev-only, needs a live URL). Instead:
- Bundle the migration SQL files into the app (`import.meta.glob` under Vite, or embed in the Rust binary via `include_dir!`).
- On boot, before any query, run the migrator against the SQLite file in Tauri's `appDataDir`.

Two workable execution paths (pick one, both fine for a single user):
- **JS driver path** — use `@tauri-apps/plugin-sql` or a WASM/`better-sqlite3`-style driver in the WebView with `drizzle-orm/.../migrator`'s `migrate(db, { migrationsFolder })` equivalent, run once at startup behind a splash gate (keeps <2s target).
- **Rust path (recommended for crash-safety + speed)** — open the DB in Rust, run migrations with `rusqlite` + a tiny embedded migrator reading the same generated SQL, expose CRUD/engine commands via Tauri `invoke`. Drizzle then acts primarily as the schema authority + type source; queries can still go through Drizzle in JS for non-hot paths.

**Baseline & recovery:**
- First run: no DB file -> create it -> apply `0000_init` -> seed system rows (see §4.1). Wrap create+migrate+seed in a single transaction where possible.
- Track applied migrations in drizzle's `__drizzle_migrations` table (auto). Idempotent: re-running applies only pending ones.
- **Backup-before-migrate:** copy the SQLite file to `productivityos.pre-<hash>.bak` before applying a new migration. Cheap insurance for a personal DB, enables manual rollback (restore the file) since SQLite has no down-migrations in drizzle-kit.
- Set pragmas at every open: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;`. WAL + `synchronous=NORMAL` is the sweet spot for crash-safety vs. write throughput on a local single-writer app.

### 4.1 Seed data (idempotent, runs after migration)
Insert the built-in study methods with `is_system=1` using `onConflictDoNothing` on a stable seed key (e.g. seed by `kind` + system flag, or pre-assigned ids 1–4):
- Pomodoro (25/5/15, 4 cycles, autoStartBreak=true)
- 52/17 (`fifty_two_seventeen`: focus 3120s / break 1020s, 1 cycle)
- Deep Work (`deep_work`: focus target 5400s, no auto break)
- Flowtime (`flowtime`: no fixed durations; focusSeconds nominal, autoStartBreak=false)

Also seed `streak_state` row id=1, and default `settings` keys (`theme='dark'`, `timerOpacity=0.9`, `alwaysOnTop=true`, `windowGeometry`, `trayEnabled=true`, `notificationsEnabled=true`, `streakGraceRestoresPerMonth=1`).

---

## 5. Date/time storage — the load-bearing decision

### 5.1 Why UTC epoch-ms `INTEGER` (not ISO text, not Drizzle timestamp mode)
- **Crash-safety heartbeat writes are cheap and atomic.** The engine writes `last_tick_at = <epoch-ms>` and `accumulated_ms += delta` every ~1s. An 8-byte integer write is the smallest, fastest, least-fragmenting update SQLite can do — no string formatting, no parsing on the hot path. On restart the engine reads the active session (`status IN ('running','paused')`), computes gap = `now - last_tick_at`, and decides recovery (mark `recovered`, don't credit the unaccounted gap as focus). Integers make this arithmetic trivial and exact.
- **Monotonic ordering & range scans for free.** `ORDER BY started_at`, "sessions in the last 7 days", analytics windows — all become integer B-tree range scans on `idx_sessions_started_at`. Text ISO also sorts, but is larger and slower.
- **No timezone ambiguity in the stored instant.** Epoch-ms is an absolute moment; DST/timezone changes never corrupt an already-recorded time. Display-layer converts to local with `Intl`/`date-fns` at render time only.
- **Why not Drizzle `{ mode: 'timestamp' }`?** That mode stores **seconds** and hands you JS `Date` objects — it silently loses millisecond precision (bad for tick math) and forces `Date` allocation on every read. We want raw numbers. So we use `integer(..., { mode: 'number' })` and keep a single `now()` helper (`Date.now()`) in the data layer.

### 5.2 Why ALSO store `local_day` (`YYYY-MM-DD` text) — separate from the epoch
The calendar color logic, streak counting, "today's tasks", and daily-note uniqueness all operate on the user's **wall-clock day**, not on UTC.
- If we derived the day from the epoch at read time, a session started at 00:30 local could fall on the *previous* UTC day, painting the wrong calendar cell and mis-counting the streak. For a user in Argentina (UTC-3, per the account), this off-by-one-day bug would be constant near midnight.
- So at **write time** we compute the local calendar day once (from local wall clock) and freeze it in `local_day`. All grouping (`GROUP BY local_day`), calendar joins, streak ledger keys, and `day_rollup`'s PK use this text column. It is timezone-drift-proof after the fact and makes queries dead simple and index-friendly (`idx_*_local_day`).
- The epoch column remains the precise instant for engine math and history; `local_day` is the human-day bucket for features. Two columns, two jobs — no contradiction, and cheap.

### 5.3 Calendar color rule (computed into `day_rollup.color`)
Recomputed by the data layer whenever a task on that day changes status or a session ends:
- `none` — no tasks and no focus that day (blank cell).
- `red` — tasks exist, `tasksCompleted == 0`.
- `yellow` — `0 < tasksCompleted < tasksTotal` (partial).
- `green` — `tasksTotal > 0 && tasksCompleted == tasksTotal`.
Monthly calendar = one range query: `SELECT local_day, color FROM day_rollup WHERE local_day BETWEEN ? AND ?`.

---

## 6. Repository/data-layer contract (keeps logic out of components)

- `src/db/client.ts` — opens SQLite, sets pragmas, runs migrations+seed, exports the Drizzle `db`.
- `src/db/time.ts` — `nowMs()`, `toLocalDay(epochMs): string`, `todayLocalDay(): string`. **Single source** for time; never call `Date.now()` elsewhere.
- `src/features/<feature>/data/*.repo.ts` — pure functions taking `db`, returning typed rows; they set `created_at`/`updated_at`, write `local_day`, and trigger `day_rollup` recompute. Zustand stores call repos; React components call stores. No SQL or `Date` in components.

---

## 7. Index rationale (all declared above)
- `sessions`: by `local_day` (calendar/rollup), `started_at` (history/analytics range), `status` + composite `(status,last_tick_at)` (fast active-session recovery lookup on startup).
- `tasks`: `(status, local_day)` composite serves both the pending page and per-day calendar counts; `deleted_at` to cheaply exclude soft-deleted rows.
- `task_events`: by `task_id`, `local_day`, `at` — history page + audit range scans.
- `daily_notes`, `streak_days`: unique on `local_day` (enforces one-per-day + fast upsert).
- `day_rollup`, `settings`: natural/text PK is the only access path needed.

## Code Sketches

// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});

// ---------------------------------------------------------------
// src/db/time.ts  — the ONLY place time is read/formatted
// ---------------------------------------------------------------
export const nowMs = (): number => Date.now();

/** Freeze the LOCAL wall-clock calendar day (YYYY-MM-DD) for an instant.
 *  Written at insert time; never re-derived from epoch at read time. */
export function toLocalDay(epochMs: number): string {
  const d = new Date(epochMs);           // local timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const todayLocalDay = (): string => toLocalDay(nowMs());

// ---------------------------------------------------------------
// src/db/client.ts — open, pragmas, migrate, seed (startup gate)
// ---------------------------------------------------------------
// (driver import depends on chosen path; pragmas + order shown)
export async function initDb(rawConn: SqliteConn) {
  await rawConn.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
  await runMigrations(rawConn);   // applies pending 000x_*.sql idempotently
  await seedSystemData(db);       // onConflictDoNothing — safe to re-run
  return db;
}

// ---------------------------------------------------------------
// Crash recovery on startup (session engine)
// ---------------------------------------------------------------
import { eq, inArray } from 'drizzle-orm';
const STALE_MS = 90_000; // if last heartbeat older than this, treat as crashed

export async function recoverSessions(db: DB) {
  const active = await db.select().from(sessions)
    .where(inArray(sessions.status, ['running', 'paused']));
  const now = nowMs();
  for (const s of active) {
    const gap = now - (s.lastTickAt ?? s.startedAt);
    if (gap > STALE_MS) {
      // Do NOT credit the unaccounted gap; bank only what was ticked.
      await db.update(sessions).set({
        status: 'recovered',
        endedAt: s.lastTickAt ?? s.startedAt,
        focusSeconds: Math.round(s.accumulatedMs / 1000),
        updatedAt: now,
      }).where(eq(sessions.id, s.id));
      await recomputeDayRollup(db, s.localDay);
    }
  }
}

// ---------------------------------------------------------------
// day_rollup recompute + calendar color (called after task/session writes)
// ---------------------------------------------------------------
export async function recomputeDayRollup(db: DB, localDay: string) {
  const [taskAgg] = await db.select({
    total: sql<number>`count(*)`,
    done: sql<number>`sum(case when ${tasks.status}='completed' then 1 else 0 end)`,
  }).from(tasks)
    .where(sql`${tasks.localDay} = ${localDay} and ${tasks.deletedAt} is null`);

  const [sessAgg] = await db.select({
    focus: sql<number>`coalesce(sum(${sessions.focusSeconds}),0)`,
    brk: sql<number>`coalesce(sum(${sessions.breakSeconds}),0)`,
    cnt: sql<number>`count(*)`,
  }).from(sessions)
    .where(sql`${sessions.localDay} = ${localDay}
               and ${sessions.status} in ('completed','recovered')`);

  const total = taskAgg?.total ?? 0;
  const done = taskAgg?.done ?? 0;
  const color: DayColor =
    total === 0 && (sessAgg?.cnt ?? 0) === 0 ? 'none'
    : total > 0 && done === 0 ? 'red'
    : total > 0 && done === total ? 'green'
    : total > 0 ? 'yellow'
    : 'none';

  const now = nowMs();
  await db.insert(dayRollup).values({
    localDay, tasksTotal: total, tasksCompleted: done,
    focusSeconds: sessAgg?.focus ?? 0, breakSeconds: sessAgg?.brk ?? 0,
    sessionCount: sessAgg?.cnt ?? 0, color, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: dayRollup.localDay,
    set: {
      tasksTotal: total, tasksCompleted: done,
      focusSeconds: sessAgg?.focus ?? 0, breakSeconds: sessAgg?.brk ?? 0,
      sessionCount: sessAgg?.cnt ?? 0, color, updatedAt: now,
    },
  });
}

// ---------------------------------------------------------------
// Typed settings KV helpers
// ---------------------------------------------------------------
export async function setSetting<T>(db: DB, key: string, val: T, type: SettingType) {
  const now = nowMs();
  await db.insert(settings)
    .values({ key, value: JSON.stringify(val), type, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key,
      set: { value: JSON.stringify(val), type, updatedAt: now } });
}

## Risks

- day_rollup consistency depends on every task/session mutation calling recomputeDayRollup; if a write path forgets, the calendar color drifts. Mitigation: funnel all task/session writes through repository functions that always recompute, and add a startup 'reconcile last N days' pass as a safety net.
- SQLite foreign_keys defaults OFF per-connection; if any code path opens a connection without setting PRAGMA foreign_keys=ON, cascade/SET NULL silently won't fire. Mitigation: centralize connection creation in one client.ts.
- Flowtime has no fixed focus/break durations, so study_methods columns are partially unused for that kind; focusSeconds default is nominal only. Acceptable but the UI/protocol builder must not treat those fields as authoritative for flowtime.
- Crash-recovery STALE_MS threshold (90s) is a heuristic; a legitimately long OS sleep/hibernate could exceed it and mark a paused session 'recovered'. For a single user this is low-impact and the banked accumulated_ms is preserved, but the threshold may need tuning after real use.
- Choosing the Rust/rusqlite runtime path for migrations vs the JS driver path is left open; if the JS path is chosen, ensure the bundled migration SQL is reachable under the CSP-restricted WebView (embed as assets, no network fetch).
- local_day is frozen at write time from local wall-clock; if the user travels across timezones the historical local_day values reflect where they were, which is the intended behavior but means a day could theoretically have >24h of buckets around a timezone shift. Negligible for a personal app.

## Open Questions

- Migration execution runtime: Rust/rusqlite runner (recommended, best for engine crash-safety and startup speed) vs JS driver in the WebView (@tauri-apps/plugin-sql). Affects where Drizzle queries execute for hot paths.
- Should tasks support recurring/rescheduling to a future day beyond the 'rescheduled' task_event, or is manual per-day creation sufficient for the MVP? Current model logs reschedule but has no recurrence engine.
- Streak qualification rule not yet locked: does a day qualify by completing >=1 task, by any focus session, or by hitting day_rollup color green? The schema stores both signals (tasksCompleted, focusSeconds) so either rule works; the threshold/config belongs in settings.
- Restore policy limits: streak_state.restoresUsed + a settings allowance (e.g. 1/month) are modeled, but the exact cadence/reset rule for restores needs a product decision.

