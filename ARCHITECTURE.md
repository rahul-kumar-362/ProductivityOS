# ProductivityOS — ARCHITECTURE.md

> A personal, single-user, offline-first Windows 11 desktop productivity app for the developer's own daily use. MVP. Local-only. No cloud, no multi-user, no AI, no plugins.

---

## 1. Overview & principles

ProductivityOS is a Tauri 2 desktop app: a **main dashboard window** plus a runtime-created **floating always-on-top timer window**. All state is local in a single SQLite file. It is built to be maintained by **one developer + Claude Code**, so the architecture optimizes for clarity and low surface area over generality.

**Locked principles**

- **Offline-first, local-only.** SQLite is the single durable store. `localStorage` holds only trivial UI prefs (a read-cache for zero-flash startup) — never authoritative state.
- **Fast startup (<2s).** DB preloaded at launch; windows hidden until first paint; recovery is a single indexed query.
- **Separation of concerns, hard boundary.** `component → hook → service → repository/tauri`. No business logic, no `Date`, no SQL, no `invoke` inside React components. Enforced by ESLint `no-restricted-imports`.
- **One source of truth per concern.** Timer state has exactly one owner (the main window). SQLite is the truth for all persisted data. No duplicated writers.
- **Centralized config, no magic values.** All durations, event names, command names, routes, storage keys, and design tokens live in `src/config/*.ts` as `as const`.
- **Dark-first, calm UI.** Linear/Raycast-inspired: flat surfaces, hairline borders, one accent, restrained motion.
- **Pragmatic, not enterprise.** Don't over-engineer. Add complexity only when a concrete need appears (YAGNI).

---

## 2. Locked tech decisions

| Area | Decision | One-line rationale |
|---|---|---|
| **Shell** | Tauri 2, WebView2 (Evergreen) on Windows 11 | Mandated stack; small native footprint. |
| **Frontend** | React 18 + TypeScript **strict** (`noUncheckedIndexedAccess`, no `any`), Vite | Mandated; strictness catches whole classes of bugs. |
| **Styling** | Tailwind CSS driven by CSS-variable design tokens | One token source; dark-first with opacity modifiers. |
| **State** | Zustand — 4 stores (timer, tasks, settings, ui) | Small, no boilerplate; per-concern split. |
| **Data** | Drizzle ORM (schema + typed queries) over SQLite | Mandated; TS is the schema source of truth. |
| **SQLite driver** ⚑ | **`tauri-plugin-sql` (sqlite) fronted by Drizzle `sqlite-proxy`** — the plugin owns the single connection. **Reject rusqlite/sqlx + hand-written commands.** | One writer, keeps Drizzle type-safety, minimal Rust surface for a solo dev. |
| **Migrations** | `drizzle-kit generate` authors versioned SQL (types + authoring); the **Rust plugin migration list is the runtime authority** (`include_str!`), applied once at startup, **append-only**. | Single deterministic runtime runner; no drift, no down-migrations to reason about. |
| **Timer ownership** ⚑ | **The main window owns the engine and is the sole DB writer.** The floating window is a pure remote control. Rust hosts windows/tray/notifications and relays intent; it does **not** write SQLite. | One writer via plugin-sql; hide-to-tray keeps the owner alive in the background. |
| **Timer timing** | Timestamp/anchor-derived elapsed (`accumulatedMs + (now − anchor)`), never per-tick accumulation | Survives crash, sleep/hibernate, DST, tick jitter. |
| **Cross-window sync** ⚑ | SQLite (durable) + Tauri `emit`/`listen` events (live), throttled to 250ms, snapshot-on-mount | Separate WebView2 heaps make Zustand unshareable; events are the built-in IPC. |
| **Floating window** | Created **at runtime** via `WebviewWindowBuilder` with `visible(false)`, shown after first paint | Fixes the WebView2 black-flash on transparent windows. |
| **Transparency/opacity** | OS window fully transparent; a rounded card owns its `rgba()` background; opacity = CSS alpha variable, not native window opacity | Text stays crisp; version-stable; identical look. |
| **Packaging** | NSIS installer, `installMode: currentUser` (no UAC), WebView2 `downloadBootstrapper`, **unsigned** | Personal daily driver; accept one-time SmartScreen. |
| **Testing** | Vitest unit tests on 3 pure areas only (timer math, streak logic, calendar date/color) with injected clock; manual smoke elsewhere. No CI/E2E. | Test the math that's regression-prone; eyeball the rest once. |

⚑ = the three explicitly-resolved cross-slice conflicts. See §7 for the full rationale.

---

## 3. Folder structure

```
C:\ProductivityOS
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs                 # entry -> lib::run()
│  │  ├─ lib.rs                  # plugin wiring, single-instance, autostart, hide-to-tray
│  │  ├─ tray.rs                 # system tray menu + events (tray://*)
│  │  ├─ floating.rs             # runtime floating-window builder (anti-flash)
│  │  └─ commands.rs             # 4 commands: timer_window_ready, open_timer,
│  │                             #             set_click_through, (opacity emit)
│  ├─ migrations/                # 0001_init.sql ... (drizzle-kit output, applied by plugin)
│  ├─ capabilities/default.json  # deny-by-default permission surface
│  ├─ icons/                     # icon.ico, 32/128/256 png, tray.png
│  └─ tauri.conf.json            # main window only; floating created at runtime
│
├─ src/
│  ├─ main.tsx                   # mounts <RouterProvider/>
│  ├─ App.tsx                    # providers (theme)
│  ├─ router.tsx                 # main shell + sibling /float route
│  │
│  ├─ windows/
│  │  ├─ MainWindow.tsx          # sidebar + <Outlet/>; runs bootstrap (recovery, hydrate)
│  │  └─ FloatWindow.tsx         # transparent, draggable; subscribes to engine events
│  │
│  ├─ features/                  # each: components/ hooks/ services/ types.ts
│  │  ├─ timer/                  #   + logic/ (pure engine) + config/
│  │  ├─ sessions/               # permanent session history
│  │  ├─ tasks/
│  │  ├─ calendar/
│  │  ├─ streaks/
│  │  ├─ notes/
│  │  ├─ analytics/
│  │  └─ settings/
│  │
│  ├─ stores/                    # timer / tasks / settings / ui  (+ index.ts)
│  │
│  ├─ services/                  # cross-cutting, feature-agnostic
│  │  ├─ tauri.ts                # the ONLY file importing @tauri-apps/api
│  │  ├─ notifications.service.ts
│  │  ├─ tray.service.ts
│  │  └─ window.service.ts       # open/close/move/opacity/click-through helpers
│  │
│  ├─ db/
│  │  ├─ client.ts               # Drizzle sqlite-proxy client + init (pragmas via migration)
│  │  ├─ time.ts                 # nowMs / toLocalDay / todayLocalDay — ONLY place Date is used
│  │  ├─ schema.ts               # all 11 Drizzle tables (single source of truth)
│  │  ├─ seed.ts                 # idempotent system rows
│  │  └─ repositories/           # tasks / sessions / notes / settings / rollup / streak ...
│  │
│  ├─ components/ui/             # design-system primitives (presentation only, no logic)
│  ├─ shared/{hooks,lib,types}/  # useDebounce, result.ts, format.ts, common types
│  ├─ config/                    # app / timer / theme / events / commands / routes (.ts as const)
│  └─ styles/{tokens.css,globals.css}
│
├─ index.html                    # no-flash inline theme script + static data-theme + critical bg
├─ tailwind.config.ts            # maps semantic tokens to rgb(var(--x)/<alpha-value>)
├─ drizzle.config.ts
└─ vite.config.ts                # port 1420, strictPort, clearScreen:false
```

Feature-based and flat: open one folder, see the whole vertical slice. `db/repositories/` is shared (not per-feature) because the schema is one file and repos are thin.

---

## 4. Data model (Drizzle over SQLite)

**Canonical conventions**

- **All instants = UTC epoch-milliseconds in `integer('...', { mode: 'number' })`.** Not Drizzle `{mode:'timestamp'}` (seconds + `Date`, loses ms needed for tick math), not ISO text.
- **Every day-scoped feature stores a frozen `local_day` TEXT (`YYYY-MM-DD`)** computed once at write time from local wall-clock. Calendar color, streaks, "today", and daily-note uniqueness all key off `local_day` — this is the fix for UTC off-by-one at UTC-3.
- **Integer autoincrement PKs** everywhere except `settings` (text key KV) and `day_rollup` (natural `local_day` PK).
- **Booleans** as `integer({mode:'boolean'})`; **enums** as TEXT with `$type<Union>()` + a CHECK constraint.
- **`created_at`/`updated_at`** set by the repository layer, not triggers.
- **Pragmas** applied by the first migration and on connection open: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`.

**11 tables**

| Table | Serves | Key columns |
|---|---|---|
| `study_methods` | Pomodoro/Flowtime/Deep Work/52-17/custom presets | `kind`, focus/break seconds, `cyclesBeforeLongBreak`, `autoStart*`, `targetSeconds`, `isSystem` |
| `timers` | Named timer presets in the floating window | `name`, `color`, `studyMethodId`(SET NULL), `targetSecondsOverride` |
| `sessions` | Crash-safe engine + permanent history + study-hours | see below — the heart |
| `session_intervals` | Per-phase (focus/break) audit + cycle analytics | `sessionId`(CASCADE), `phase`, `startedAt`, `endedAt`, `durationSeconds` |
| `tasks` | Pending/completed pages | `title`, `status`, `localDay`, `completedAt`, `priority`, `deletedAt` (soft) |
| `task_events` | Task history (append-only audit) | `taskId`(CASCADE), `type`, `localDay`, `at`, `payload` |
| `daily_notes` | One markdown note/day, autosave | `localDay` (UNIQUE), `content` |
| `streak_state` | Singleton (id=1) current/longest streak | `currentStreak`, `longestStreak`, `lastQualifiedDay`, `restoresUsed` |
| `streak_days` | Per-day streak ledger + restore | `localDay` (UNIQUE), `qualified`, `restored`, snapshots, `restoredAt` |
| `day_rollup` | Calendar color **and** analytics cache | `localDay` (PK), tasks total/done, focus/break secs, `sessionCount`, `color` |
| `settings` | Typed KV: theme, opacity, geometry, tray/notif prefs | `key` (PK), `value` (JSON), `type` |

**`sessions` (the crash-safe core)** — timestamp-derived, recoverable, denormalized so history survives preset deletion:

```ts
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timerId: integer('timer_id').references(() => timers.id, { onDelete: 'set null' }),
  studyMethodId: integer('study_method_id').references(() => studyMethods.id, { onDelete: 'set null' }),
  // Denormalized snapshots so deleting/renaming a preset never orphans history:
  timerName: text('timer_name'),
  methodKind: text('method_kind').$type<StudyMethodKind>(),
  protocolJson: text('protocol_json').notNull(),          // frozen block list at start
  status: text('status').$type<SessionStatus>().notNull().default('running'),
  startedAt: integer('started_at').notNull(),             // epoch-ms UTC (session origin)
  endedAt: integer('ended_at'),
  localDay: text('local_day').notNull(),                  // YYYY-MM-DD of startedAt (local)
  // Timestamp-derivation + crash safety:
  accumulatedMs: integer('accumulated_ms').notNull().default(0),  // banked focus
  runningSinceUtc: integer('running_since_utc'),          // anchor of current live segment; null unless running
  lastTickAt: integer('last_tick_at'),                    // heartbeat (recovery anchor)
  blockIndex: integer('block_index').notNull().default(0),
  wasRecovered: integer('was_recovered', { mode: 'boolean' }).notNull().default(false),
  // Final rollups (seconds) for cheap analytics:
  focusSeconds: integer('focus_seconds').notNull().default(0),
  breakSeconds: integer('break_seconds').notNull().default(0),
  completedCycles: integer('completed_cycles').notNull().default(0),
  targetSeconds: integer('target_seconds'),
  interruptedCount: integer('interrupted_count').notNull().default(0),
  note: text('note'),
  ...timestamps,
}, (t) => [
  index('idx_sessions_local_day').on(t.localDay),
  index('idx_sessions_started_at').on(t.startedAt),
  index('idx_sessions_active').on(t.status, t.lastTickAt),
  // Exactly ONE live session app-wide:
  uniqueIndex('ux_one_active_session').on(t.status).where(sql`status IN ('running','paused')`),
  check('ck_sessions_status', sql`${t.status} IN ('running','paused','completed','abandoned','recovered')`),
]);
```

**Relations & cascade summary**

- `session_intervals.session_id → sessions.id` **CASCADE**; `task_events.task_id → tasks.id` **CASCADE**.
- `sessions.timer_id`, `sessions.study_method_id`, `timers.study_method_id` → **SET NULL** (history outlives presets; denormalized snapshots preserve meaning).
- Tasks **soft-delete** (`deletedAt`); sessions and notes are **never** hard-deleted; timer/method presets **hard-delete**.

**`day_rollup` is the calendar-color source AND analytics cache.** It is upserted (`onConflictDoUpdate` on `localDay`) by the repository layer after **any** task/session write. Calendar color rule computed into `day_rollup.color`:

- `none` — no tasks and no focus that day.
- `red` — tasks exist, `tasksCompleted == 0`.
- `yellow` — `0 < tasksCompleted < tasksTotal` (partial).
- `green` — `tasksTotal > 0 && tasksCompleted == tasksTotal`.

Monthly calendar = one range query: `SELECT local_day, color FROM day_rollup WHERE local_day BETWEEN ? AND ?`.

**Seed (idempotent, after migration):** 4 system study methods (`isSystem=1`): Pomodoro (25/5/15, 4 cycles, autoStartBreak), 52/17, Deep Work (90m target), Flowtime (open-ended); `streak_state` id=1; default settings (`theme=dark`, `timerOpacity=0.92`, `alwaysOnTop=true`, window geometry, `trayEnabled`, `notificationsEnabled`, `streakRestoresPerMonth=1`).

---

## 5. State / store design (Zustand — 4 stores)

| Store | Persist? | Purpose |
|---|---|---|
| `timer.store` | **no** (SQLite is truth) | Mirror of the authoritative engine snapshot; stores the **anchor**, not elapsed |
| `tasks.store` | **no** (SQLite is truth) | Today's pending/completed lists; optimistic update + reconcile |
| `settings.store` | **yes** (localStorage) | theme, opacity, default method, notifications — write-through to SQLite |
| `ui.store` | **yes** (localStorage) | floatMode (compact/mini), sidebarCollapsed, activeModal |

Rules:

- `timer`/`tasks` are **never** persisted to `localStorage` — that would create a second source of truth. They hydrate from services at startup.
- `settings`/`ui` persist to `localStorage` for zero-flash reads; `settings.service` also **writes through to the `settings` SQLite table** as the durable/backup copy.
- **Elapsed is never stored in state.** Components read a derived selector `useDerivedElapsed()` computing `accumulatedMs + (Date.now() − runningSinceUtc)` from the anchor → no re-render storm, no drift, and the two windows always agree because they derive from the same broadcast anchor.

---

## 6. The crash-safe timer engine

**Ownership (conflict resolution).** The engine — state machine, protocol logic, persistence, and crash recovery — is **pure TypeScript hosted in the main window**, which is the **sole SQLite writer**. The floating window is a pure remote control. Rust hosts the windows/tray/notifications and provides an authoritative 1 Hz relay tick; it does **not** write the database. This keeps a single writer through `plugin-sql` while preserving crash-safety, because **hide-to-tray keeps the main WebView2 alive in the background** (WebView2 is destroyed only on real quit) and `single-instance` guarantees no competing owner.

**Two-clock rule.**
- **Live elapsed** derives from the wall clock anchor: `elapsed = accumulatedMs + (Date.now() − runningSinceUtc)`, clamped `≥ 0`. Never `elapsed += 1` in an interval.
- **Persisted timestamps** are UTC epoch-ms for history, calendar bucketing, and cross-restart recovery. The 250 ms UI interval is **cosmetic re-render only**.

Why: this survives all four Windows failure modes — process crash, sleep/hibernate/WebView2 throttling, DST/NTP jumps, and tick jitter.

**Modes as one unified protocol.** Everything is an ordered list of **blocks** `{ kind: 'focus'|'break'|'longBreak', durationMs: number|null }` (`null` = open-ended count-up). Study methods are pure config builders (`buildProtocol(method, params) → Block[]`), so the engine has **no per-method branching**:

- Flowtime → one open focus block; a break block sized by rule is appended on stop.
- Deep Work → one `{focus, 90m}` block.
- 52/17 → Pomodoro preset with 52m/17m.
- Custom → the user's authored block list.

**State machine:** `idle → running ⇄ paused → completed` (+ `abandoned`/`recovered`). "Break" is a running block whose `kind` is break, not a top-level state. Every transition (start/pause/resume/block-advance/stop/abandon) is persisted in a transaction; a **15 s heartbeat** updates `lastTickAt` + `accumulatedMs`. **Persist on transition + heartbeat, never per tick.**

**Session + intervals.** `accumulatedMs` on the session row is authoritative; `session_intervals` are the corroborating per-phase audit trail (a new interval per resume / block change). On pause, the running segment's time is banked into `accumulatedMs` so the session row alone is enough to recover.

**Crash recovery (on main-window bootstrap, before UI).** Query the single active session (`status IN ('running','paused')`):

- **paused** → already safe (`accumulatedMs` fully banked); restore as paused, no math.
- **running** → app died mid-run:
  - `gap = max(0, now − lastTickAt)` (backward clock/DST → 0).
  - **Clamp** credited gap to `IDLE_MAX_RECOVERABLE_MS` (5 min) — never credit hours of sleep as focus.
  - `gap ≤ RECOVERY_LIVE_THRESHOLD` (90 s, genuine crash) → restore as **paused** with `accumulatedMs += clamp(gap)`, surface a non-blocking "Recovered — resume?" toast. Never silently auto-resume.
  - `gap > threshold` → finalize as `completed` (`wasRecovered=true`, `endedAt = lastTickAt + clamp`) — lands honestly in history.

Guarantees: **no lost sessions, no inflated time, no auto-resume without consent.**

**Light idle handling (MVP).** Rust reads OS last-input time; if idle `> IDLE_PROMPT_MS` (8 min) during a focus block, emit `engine:idle-detected`. UI shows a gentle prompt (keep / discard / pause); **no auto-pause**; default-if-ignored = keep. "Discard" subtracts the idle interval from `accumulatedMs`. Sleep is not idle's job — wall-clock derivation + heartbeat handle it.

**Centralized constants** (`features/timer/config/constants.ts`): `ENGINE_TICK_MS=1000`, `UI_TICK_MS=250`, `HEARTBEAT_MS=15000`, `RECOVERY_LIVE_THRESHOLD_MS=90000`, `IDLE_MAX_RECOVERABLE_MS=300000`, `IDLE_PROMPT_MS=480000`, `STATE_BROADCAST_MS=250`.

---

## 7. Cross-window sync (the second resolved conflict)

Each Tauri window is a **separate WebView2 process with its own JS heap**, so Zustand is not shareable across windows — a cross-window channel is mandatory regardless.

**Design: SQLite (durable) + Tauri events (live).**

```
[Either window] user clicks Start/Pause/Skip/Stop
   └─ invoke('timer:command', {...})  ──▶  MAIN WINDOW engine (sole owner + sole DB writer)
                                              │  mutates state, persists transition (plugin-sql)
                                              │  Rust 1 Hz relay tick + transition => emit('timer:state', snapshot)
                                              ▼
                          ┌───────────────────┴───────────────────┐
                   MainWindow useTimerEvents            FloatWindow useTimerEvents
                     -> timer.store (anchor)              -> timer.store (anchor)
```

- **Commands are fire-and-forget from the UI.** A floating-window button calls `invoke('timer:command', {type:'pause'})` and does **not** locally set paused — it waits for the next `timer:state` broadcast. This guarantees both windows render identical state.
- **Broadcast throttled to 250 ms**; the payload carries the anchor (`runningSinceUtc`, `accumulatedMs`, `blockIndex`, `status`), not a pre-rendered string. Each window runs a display-only rAF/interval deriving elapsed. If a background window's rAF is throttled, the next visible frame is instantly correct (no accumulation → no drift).
- **Snapshot-on-mount.** On open/reopen the floating window requests a full snapshot (`get_engine_state`) so it re-syncs after being closed or after a WebView reload — the engine (main window) never stopped.
- Tasks/notes/calendar do **not** need live cross-window sync (only the main window shows them) → simple SQLite reads. The event pattern extends later if ever needed (YAGNI).

---

## 8. Tauri desktop integration

**Windows.** `tauri.conf.json` declares **only** the `main` window (1100×720, decorated, dark theme, `windowBackgroundColor` = `#09090C` to prevent white flash). The **floating window is created at runtime** via `WebviewWindowBuilder` (`transparent(true)`, `decorations(false)`, `always_on_top(true)`, `skip_taskbar(true)`, `shadow(false)`, `visible(false)`), loading `index.html#/float`. It is revealed only after the React route mounts and calls `timer_window_ready` — the fix for the WebView2 black-flash. `tauri-plugin-window-state` persists/restores position & size (multi-monitor safe); custom 16 px edge-snapping is layered in logical pixels.

**Transparency & opacity.** OS window fully transparent; a rounded card owns its `rgba()` background. Opacity is a CSS alpha variable driven by the settings slider (30–100%), **not** native window opacity — text stays crisp. Corners faked with CSS `border-radius`; native DWM shadow omitted.

**Click-through (ghost mode).** `set_ignore_cursor_events(true)` requires the transparent/undecorated window and makes it unable to receive mouse events — so it must be re-enabled from the tray or a global shortcut, not from within the ghosted window.

**Tray.** Built in Rust `setup()` before first window show. Menu: Open dashboard, Start/Pause timer, Quick add task, Quit. Left-click toggles the dashboard; right-click opens the menu. Menu items **emit `tray://*` events** the frontend reacts to (keeps business logic in TS). Real quit only via "Quit" → `app.exit(0)`.

**Hide-to-tray.** Intercept the main window `CloseRequested` → `api.prevent_close(); window.hide()`. This keeps the engine-owning WebView alive in the background (essential for the single-writer + crash-safety design).

**Single-instance + autostart.** `tauri-plugin-single-instance` registered **first**; a second launch focuses the running main window. `tauri-plugin-autostart` launches with `--minimized`; `setup()` hides the main window on boot when that flag is present.

**Notifications.** Frontend `tauri-plugin-notification`, permission-checked once, for phase transitions / session end / streak-at-risk.

**SQLite (the primary resolved conflict).** `tauri-plugin-sql` (sqlite feature) owns the **single** connection, preloaded at startup (`preload: ["sqlite:productivityos.db"]`, under `%APPDATA%\<identifier>`). Drizzle runs in **`sqlite-proxy`** mode: it generates SQL, the plugin executes it. The load-bearing bridge maps the plugin's **row-objects** to the **array-of-values** the proxy expects:

```ts
export const db = drizzle(async (sql, params, method) => {
  const c = await conn();                                  // Database.load('sqlite:productivityos.db')
  if (method === 'run') { await c.execute(sql, params); return { rows: [] }; }
  const rowsObj = await c.select<Record<string, unknown>[]>(sql, params);
  const rows = rowsObj.map((r) => Object.values(r));       // objects -> value arrays
  return { rows: method === 'get' ? (rows[0] ? [rows[0]] : []) : rows };
}, { schema, casing: 'snake_case' });
```

Prefer explicit column lists in Drizzle selects so `Object.values` ordering is guaranteed; an integration test round-trips a multi-column row as a guard. `INSERT/UPDATE/DELETE` route through `execute` (empty rows); `SELECT` through `select`.

**Migrations.** `drizzle-kit generate` produces versioned SQL committed to `src-tauri/migrations/`; the **Rust plugin migration list is authoritative at runtime** (`Migration { version, sql: include_str!(...), kind: Up }`), applied once, idempotently, **append-only**. `drizzle-kit` never runs against the live DB. First migration also sets the pragmas.

**Permissions (deny-by-default).** `capabilities/default.json` scoped to windows `["main","floating-timer"]`, enumerating exactly: `core:default`, window `set-always-on-top` / `set-ignore-cursor-events` / `start-dragging` / `set-position` / `set-size` / `show` / `hide` / `close`, `sql:allow-execute` / `sql:allow-select`, `notification:default`, `autostart:default`, `window-state:default`.

**Packaging.** NSIS, `installMode: currentUser` (no UAC, `%LOCALAPPDATA%\Programs\ProductivityOS`), `webviewInstallMode: downloadBootstrapper`, lzma. Unsigned (accept one-time SmartScreen). One-click SQLite file backup/export in Settings.

**Rust stays thin:** window lifecycle + tray + plugin wiring + 4 commands (`timer_window_ready`, `open_timer`, `set_click_through`, opacity emit). All business logic is in TS.

---

## 9. Design-system summary

**Philosophy:** dark-first; flat layered depth (surface-lightness steps + hairline borders, not shadows/gradients); one indigo-violet accent; calm motion (120–260 ms, respect `prefers-reduced-motion`); transparency only where load-bearing (floating window, overlays).

**Token architecture.** Colors are **raw space-separated RGB channel triplets** in CSS vars, consumed via `rgb(var(--x) / <alpha-value>)` so every Tailwind opacity modifier (`bg-surface/80`, `text-muted/50`) works off one variable. Theme is an explicit `data-theme` attribute on `<html>` (`dark`/`light`), never `@media prefers-color-scheme`; JS resolves a `system` choice.

**Zero-flash (three parts):** (1) a render-blocking inline script in `<head>` sets `data-theme` before first paint; (2) `index.html` ships `data-theme="dark"` + a critical `html{background:...}` style matching the Tauri `windowBackgroundColor` (#09090C); (3) theme transitions animate only when the user actively toggles, via a temporary `.theme-transition` class — cold start never flickers.

**Scales:** spacing 4 px base (+ customs `4.5=18`, `13=52`); radius `sm6/md8/lg10/xl14/2xl18`; type on **14 px base** (dense desktop) with Inter var + JetBrains Mono bundled locally as woff2 (offline, no CDN), `font-variant-numeric: tabular-nums` global so timer digits don't jitter; subtle shadows reserved for floating layers.

**Tailwind:** `darkMode: ['selector', "[data-theme='dark']"]`; components use **only semantic tokens**, never `dark:` variants (avoids double-theming). **Recharts caveat:** SVG can't consume `rgb(var())` with alpha, so a `useThemeColors()` hook reads `getComputedStyle` on `data-theme` change and passes concrete `rgb()` strings into charts.

**MVP component inventory** (`src/components/ui/`, presentation-only): Button/IconButton, Input/Textarea/Select/Checkbox/Switch/Slider/SegmentedControl, Badge, Kbd; Card/Modal/Popover/Tooltip/Toast; AppShell/Sidebar/PageHeader/Tabs/EmptyState/Divider/ScrollArea; Spinner/ProgressRing/ProgressBar/Skeleton/StatCard; and thin domain-shaped composites TimerReadout, TimerWindowChrome, TaskItem, CalendarCell, StreakBadge, NoteEditor, Chart wrappers. (Skip Avatar — single user.)

---

## 10. How the pieces fit together

**Data-access boundary (enforced by ESLint):**

```
component  →  hook  →  service (Result<T,AppError>, business logic)  →  repository (Drizzle) / tauri.ts
```

Components import hooks only. Hooks orchestrate optimistic updates + rollback and bind stores. Services hold validation, protocol/streak/aggregation math. Repositories are pure I/O; they set `created_at`/`updated_at`, write `local_day`, and trigger `day_rollup` recompute. `services/tauri.ts` is the only file importing `@tauri-apps/api`; `db/time.ts` is the only place `Date` is used.

**Startup sequence (main window, budget <2s):**

1. `plugin-sql` preloads the DB → migrations applied (Rust list) → pragmas set.
2. Main-window bootstrap: run **crash recovery** (single active-session query), then **reconcile last N days** of `day_rollup` (safety net), then seed idempotently.
3. Hydrate `tasks`/`timer` stores from services; `settings`/`ui` read from localStorage (write-through to SQLite).
4. Reveal main window after first paint. If `--minimized`, stay hidden in tray.
5. Rust starts the 1 Hz relay tick when a session is running; both windows subscribe to `timer:state`.

**A write, end to end (complete a task):** `TaskItem` → `useTasks.toggleTask` (optimistic) → `task.service.toggle` → `tasks.repo.setDone` + append `task_events` row + `recomputeDayRollup(localDay)` + recompute streak → store reconciles from confirmed rows → calendar/analytics read the updated `day_rollup` instantly.

**The single writer, restated:** every persisted mutation — tasks, notes, sessions, streaks, settings, rollups — flows through repositories in the **main window** over the one `plugin-sql` connection. The floating window never writes. Rust never writes. This is what makes the concurrency story trivial and crash-safe for a solo-maintained MVP.
