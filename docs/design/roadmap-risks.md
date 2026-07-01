# Design: roadmap-risks

> A 9-milestone incremental roadmap for one developer + Claude Code, ordered strictly by dependency so every milestone is independently runnable and reviewable, starting from the hardest de-risking work (persistence layer + floating always-on-top transparent window) rather than easy UI. It pairs the roadmap with 8 stack-specific technical risks (Tauri transparency/AOT on Windows, Drizzle-over-Tauri-SQL driver friction, monotonic timer accuracy across sleep/hibernate, floating↔main window state sync, WebView2 quirks, SQLite crash-safety, migrations, bundle signing) each with a concrete, decided mitigation. Testing is deliberately lightweight: pure-function Vitest unit tests on the three things that are genuinely math-heavy and regression-prone (timer engine, streak logic, calendar date/color), and manual smoke checks for everything else — no CI/CD, no E2E harness.

## Decisions

- De-risk-first sequencing: persistence bridge (M0) and floating transparent AOT window (M1) come BEFORE any feature UI, because both can force architecture changes.
- 9 milestones (M0-M8), each independently runnable via `tauri dev` and PR-sized for Claude Code review.
- Drizzle used in query-builder-only mode: author typed queries, call `.toSQL()`, execute the `{sql, params}` through `@tauri-apps/plugin-sql`'s async `Database.select/execute`. Drizzle does NOT own the connection.
- Migrations: drizzle-kit generates SQL for types + authoring, but the Rust plugin's migration list is the single runtime authority; migrations are append-only.
- Timer elapsed is DERIVED from a `Date.now()` anchor + accumulated paused time on every read, never accumulated per-tick; the 250ms interval is cosmetic re-render only. This is the fix for sleep/hibernate drift.
- Single engine owner = main window (only DB writer); the floater is a pure remote control via Tauri emit/listen events, throttled to 250ms, snapshot-on-mount. Prevents double-counting.
- Transparency handled by a self-contained rounded card with `rgba()` background over a fully-transparent OS window; opacity adjusts a CSS alpha variable, NOT OS window opacity. Shadow disabled.
- Crash safety: SQLite WAL + synchronous=NORMAL, open-session row + 5s heartbeat, launch-time reconciliation of stale open sessions using last_seen_at (never over-counts).
- All day boundaries keyed by local-tz `YYYY-MM-DD` strings via one centralized `shared/lib/date.ts`; DST/timezone-safe.
- Study methods modeled as a generic protocol config object `{phases, loop}` consumed by one engine — no per-method branching.
- Testing: Vitest unit tests ONLY on 3 pure areas (timer math, streak logic, calendar date/color) with injected clock; everything else is manual smoke-test per milestone. No CI/CD, no E2E.
- Packaging: skip code signing for a personal MVP (accept SmartScreen one-time bypass); bundle WebView2 Evergreen bootstrapper; ship NSIS installer; use tauri-plugin-single-instance and one-click SQLite file backup in Settings.

# ProductivityOS — Build Roadmap & Risk Register

## Guiding sequencing principle

De-risk first, polish last. The two things most likely to sink this project are (1) the persistence layer (Drizzle over Tauri's async SQL plugin) and (2) the floating transparent always-on-top window on Windows/WebView2. Both are **spike-worthy before any feature work**, because if either can't be made to work cleanly, the whole architecture shifts. So the roadmap front-loads them into M0/M1 rather than saving the "hard window" for the end.

Every milestone below is a **runnable app**: at any commit you can `pnpm tauri dev` and see/use what was built. No milestone leaves the tree in a broken state. Each is also a natural PR-sized review unit for Claude Code.

Feature-based folders assumed throughout:

```
src/
  app/            # router, providers, global shell
  features/
    timer/        # {ui, logic, store, db} per feature
    tasks/
    calendar/
    notes/
    streaks/
    analytics/
    settings/
  shared/         # ui primitives, hooks, lib (date, time, ids)
  db/             # drizzle schema, client, migrations
  config/         # centralized constants (no magic values)
src-tauri/        # rust: window mgmt, tray, notifications, single-instance
```

---

## The roadmap

### M0 — Skeleton + persistence spike (the foundation)
**Goal:** Prove the stack end-to-end with the riskiest integration wired first. A running Tauri window that reads/writes SQLite through Drizzle-typed queries.

**Deliverables:**
- Tauri 2 + Vite + React 18 + TS strict + Tailwind + Zustand + React Router scaffold. `tsconfig` with `strict: true`, `noUncheckedIndexedAccess: true`; ESLint rule banning `any`.
- `tauri-plugin-sql` (v2.4.x) installed and configured with a migration list in Rust.
- **The Drizzle↔Tauri bridge**: a thin async adapter so we author queries with Drizzle's query builder for type-safe SQL, but execute the generated SQL string + params through `Database.execute/select` from `@tauri-apps/plugin-sql`. Drizzle is used in **"generate SQL, don't own the connection"** mode (see Risk R2 for the exact pattern).
- `config/` with centralized constants (DB name, app name, default opacity, timer tick interval).
- Dark-first Tailwind theme tokens (CSS variables) defined once.

**Done looks like:** App boots in <2s. A throwaway debug button inserts a row and renders it back from SQLite. `drizzle-kit` generates a migration from schema; the migration runs on first launch and is idempotent on second launch. TypeScript catches a deliberately wrong column name at compile time.

---

### M1 — The floating timer window (the other hard thing)
**Goal:** The signature feature's hardest part: a second, transparent, always-on-top, draggable, frameless window with adjustable opacity — before any timer logic exists.

**Deliverables:**
- Second `WebviewWindow` (`label: "floater"`) defined in `tauri.conf.json`: `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `shadow: false`, `resizable: false`.
- CSS: `html,body { background: transparent }`; the visible pill is a rounded card with its own background so transparency actually renders (WebView2 fills white otherwise — Risk R1).
- Custom drag via `data-tauri-drag-region` on the card header.
- Opacity slider that calls `getCurrentWebviewWindow().setAlwaysOnTop` state + adjusts card `background` alpha (NOT the OS window opacity — see R1). Compact ↔ mini state toggle that resizes the window via `setSize`.
- Router: the floater route (`/floater`) is a distinct entry the second window loads; main window loads `/`.

**Done looks like:** Two windows open. The floater sits above other apps (tested against a maximized browser), has no taskbar entry, is draggable by its header, has a working opacity control, and toggles between compact and mini sizes. No white box, no visible frame.

---

### M2 — Timer & session engine (pure logic + crash safety)
**Goal:** The crash-safe timer/session engine as **framework-agnostic pure TypeScript**, driving the M1 window. Zero React business logic.

**Deliverables:**
- `features/timer/logic/engine.ts`: monotonic-clock-based engine. State = `{ startedAtEpochMs, accumulatedMs, status, method }`. Elapsed is **computed from wall-clock deltas via `performance.now()` anchored to `Date.now()`**, never accumulated per-tick (Risk R3). UI tick is cosmetic (250ms) and only re-renders; it does not define elapsed time.
- Session persistence: on start, write an `open` session row; heartbeat-update `last_seen_at` every ~5s; on stop/pause write final duration. On app launch, reconcile any `open` sessions (crash recovery) — Risk R6.
- Study methods as a **protocol config object**, not branches: Pomodoro, Flowtime, Deep Work, 52/17, and a custom builder all expressed as `{ phases: [{kind, durationMs|null}], loop }`. The engine consumes protocols generically.
- Zustand store wraps the engine; the floater and main window both subscribe (state sync deferred to M3).

**Done looks like:** Start a Pomodoro, kill the app mid-session, reopen — the session is recovered/closed correctly and appears in history. Elapsed time is accurate after the machine sleeps for 5 minutes (does not "pause" or drift). Switching protocols works with no engine code changes. Unit tests green (see Testing).

---

### M3 — Floating ↔ main window state sync
**Goal:** Both windows show the same live timer state and can both control it, with one source of truth.

**Deliverables:**
- **Single owner of engine state = the main window** (or a Rust-side store; decided: main window owns, Rust relays). Cross-window sync via Tauri's event system: `emit`/`listen` on `timer:state` (Risk R4). The floater is a thin remote control — it emits `timer:command` (start/pause/stop) and renders `timer:state` snapshots.
- Debounced/throttled state broadcast (250ms max) to avoid event floods.
- Reconnect logic: floater requests a full state snapshot on mount.

**Done looks like:** Start a timer from the floater; the main window's timer view updates live, and vice-versa. Close and reopen the floater mid-session; it re-syncs to current state. No divergence, no double-counting.

---

### M4 — Tasks (pending / completed / history)
**Goal:** Daily task management with clean separation of concerns.

**Deliverables:**
- `tasks` schema: `id, title, notes, status, created_at, completed_at, due_date (day granularity)`.
- Logic layer: create, complete, uncomplete, delete, "carry over / roll to today" for uncompleted tasks.
- Three views (routes): Pending, Completed, History — presentation only, all logic in `features/tasks/logic`.
- Zustand store + Drizzle queries.

**Done looks like:** Add/complete/reopen tasks; completed items leave Pending and appear in Completed; History shows past days. Restart persists everything.

---

### M5 — Calendar + streaks (the date-math milestone)
**Goal:** Monthly color-coded calendar and the streak system — the two most bug-prone date computations, built together and unit-tested hard.

**Deliverables:**
- `shared/lib/date.ts`: **all** day-boundary logic centralized. Days are keyed by **local-timezone `YYYY-MM-DD` strings**, computed once, never by naive `Date` math (Risk: DST/timezone off-by-one).
- Calendar color rule (pure fn): for a given day → `green` (all tasks done & ≥1 task or session), `yellow` (partial), `red` (none done), `neutral` (no data / future). Rule lives in `features/calendar/logic/dayColor.ts`.
- Streak logic (pure fn): current streak, longest streak, and **streak restore** (a limited "grace" that fills one gap day). Streak = consecutive qualifying days up to today; a same-day-not-yet-done state does not break the streak until the day ends.
- Recharts not yet — calendar is a custom grid.

**Done looks like:** Calendar renders the current month with correct per-day colors from real task/session data. Streak counter is correct across month boundaries and after using restore once. All three pure functions have thorough unit tests including DST and month-boundary cases.

---

### M6 — Daily notes (markdown, autosave)
**Goal:** One markdown note per day with debounced autosave.

**Deliverables:**
- `notes` schema: `day (YYYY-MM-DD, unique), content, updated_at`. Upsert-by-day.
- Debounced autosave (~800ms after last keystroke) + save on blur/window-close.
- Markdown render (a small, dependency-light renderer; no heavy editor).

**Done looks like:** Type a note, switch days and back, restart the app — content persists. No lost keystrokes on rapid typing; save fires on close.

---

### M7 — Analytics, tray & notifications
**Goal:** Read-only insights + OS integration.

**Deliverables:**
- Recharts views over existing data: study hours (per day/week), task completion rate, streak trend. All aggregation in `features/analytics/logic` (pure), charts are dumb.
- System tray (`tauri-plugin-` tray): show/hide main, show/hide floater, quit.
- Native notifications (`tauri-plugin-notification`): phase transitions (e.g., Pomodoro break start), permission requested once.
- `tauri-plugin-single-instance` so relaunch focuses the running app instead of opening a second copy (Risk-adjacent to R4).

**Done looks like:** Charts reflect real usage. Tray controls both windows. A break-start notification fires. Launching the app twice focuses the existing instance.

---

### M8 — Settings, polish, packaging
**Goal:** Settings page, animation polish, and a shippable installer.

**Deliverables:**
- Settings: default opacity, default protocol, notification toggles, theme (dark default, light optional), "start on boot" (autostart plugin), data location display, streak-restore budget.
- Framer Motion: light transitions only (window state changes, list add/remove). Nothing heavy.
- Tauri bundler → Windows installer (NSIS + MSI). App icon, product metadata, version.
- Backup/export: one-click copy of the SQLite file (cheap insurance for a personal daily driver).

**Done looks like:** Installs from the generated installer on a clean-ish Windows profile, launches in <2s, all features work, settings persist. This is the MVP.

---

## Risk register (stack-specific, each with a decided mitigation)

**R1 — Tauri transparency + always-on-top on Windows/WebView2 renders a white box.**
WebView2 paints an opaque white background even when the window is `transparent: true`; naive OS-level window opacity also blurs text.
*Mitigation (decided):* Keep the OS window fully transparent (`html,body { background: transparent !important }`) and render a **self-contained rounded card with its own `rgba()` background**. "Opacity" adjusts that card's background/foreground alpha via a CSS variable — **not** `setDecorations`/window opacity — so text stays crisp. Disable window shadow (`shadow: false`) to avoid the known Windows border artifacts. Verify AOT against a maximized fullscreen window early (M1), since exclusive-fullscreen apps can still cover AOT windows — acceptable for this use case.

**R2 — Drizzle ORM does not natively drive the Tauri SQL plugin (async command bridge, not a sync/better-sqlite3 driver).**
`@tauri-apps/plugin-sql` exposes async `Database.execute(sql, params)` / `Database.select(sql, params)` over sqlx; Drizzle's official drivers expect their own connection objects.
*Mitigation (decided):* Use Drizzle in **query-builder-only** mode. Author schema + queries with Drizzle for full TS types, but call `.toSQL()` to get `{ sql, params }` and run it through a thin `tauriSqliteProxy`. This gives compile-time-typed queries without fighting Drizzle's driver layer. Migrations are generated with `drizzle-kit` but **executed by the Rust plugin's migration runner** (single source of truth for schema at startup). Prototype this exact bridge in M0 — if it's too rough, fall back to hand-written SQL + Drizzle types only.

```ts
// db/proxy.ts — the load-bearing bridge
const q = db.select().from(tasks).where(eq(tasks.status, "pending"));
const { sql, params } = q.toSQL();
const rows = await database.select<Task[]>(sql, params); // plugin-sql async
```

**R3 — Timer drift across sleep/hibernate and background-tab throttling.**
`setInterval` accumulation undercounts when the machine sleeps or WebView2 throttles background timers; per-tick `+=` compounds error.
*Mitigation (decided):* Never accumulate elapsed time from ticks. Store an **anchor** (`Date.now()` at start/resume) and **derive** elapsed as `now - anchor + accumulatedPausedMs` on every read. The 250ms interval only triggers a re-render. On the Rust side, listen for the resume/suspend signal where feasible and re-anchor on `visibilitychange`/focus. Countdown protocols (Pomodoro) compute remaining from the anchor, so a 30-min sleep correctly shows the phase as elapsed/completed on wake, not frozen.

**R4 — Floating ↔ main window state divergence / double-counting.**
Two windows each running their own engine instance would double-count and diverge.
*Mitigation (decided):* **One owner.** The main window owns the engine and is the only writer to the DB. The floater is a pure remote: emits `timer:command`, renders `timer:state` snapshots received via Tauri events (throttled to 250ms). Floater requests a full snapshot on mount (handles late-open/reopen). Use `tauri-plugin-single-instance` so a relaunch never spawns a competing owner.

**R5 — WebView2 quirks (runtime presence, storage isolation, dev vs prod behavior).**
WebView2 runtime may be missing on target machine; localStorage/IndexedDB are per-webview and not a safe store; some CSS/DOM behaviors differ from Chrome dev.
*Mitigation (decided):* Bundle the **Evergreen WebView2 bootstrapper** in the installer (Tauri supports this) so a clean machine self-provisions. Treat SQLite as the **only** durable store — never persist real state in localStorage (only trivial UI prefs). Test in the actual bundled build before each milestone sign-off, not just `tauri dev`, to catch dev/prod divergence (CSP, asset paths, transparency).

**R6 — SQLite corruption / lost session on crash.**
A hard crash mid-write can lose an in-flight session or leave partial data.
*Mitigation (decided):* Enable **WAL mode + `synchronous=NORMAL`** (pragmas run in the Rust migration/init). Write an `open` session row at start and **heartbeat** `last_seen_at` every ~5s. On launch, reconcile: any `open` session with a stale heartbeat is closed with duration = `last_seen_at - started_at` (conservative, never over-counts). One-click SQLite file copy in Settings (M8) as manual backup.

**R7 — Migration drift between `drizzle-kit` output and the Rust plugin's migration list.**
Two migration mechanisms (drizzle-kit generation vs plugin runtime) can fall out of sync.
*Mitigation (decided):* **Rust plugin's migration list is authoritative at runtime.** `drizzle-kit generate` is used only to *produce* SQL and to keep TS types honest; each generated migration's SQL is copied into the Rust `Migration` array with a stable incrementing version. Never let drizzle-kit run migrations against the live DB. A startup assertion logs the applied schema version. Keep migrations append-only (no editing shipped ones).

**R8 — Windows packaging: unsigned installer SmartScreen warnings + WebView2 dependency.**
An unsigned MVP installer triggers SmartScreen; missing WebView2 fails silently.
*Mitigation (decided/honest):* For a **personal daily driver, skip code signing** (accept the one-time SmartScreen "More info → Run anyway"). Do NOT spend money/time on an EV cert for an MVP you install on your own machine. Use the WebView2 Evergreen bootstrapper (R5). Ship NSIS for the lightweight installer; MSI optional. Pin the Tauri version to avoid bundler surprises.

---

## Testing approach (lightweight, no CI/CD)

**Philosophy:** Unit-test only the pure functions where a subtle bug is likely and expensive; smoke-test everything else by hand. No E2E, no CI pipeline, no coverage gates — this is a one-person app. Vitest runs locally on demand (`pnpm test`).

**Genuinely worth unit-testing (all pure, no I/O, no React):**

1. **Timer engine math** (`features/timer/logic/engine.ts`)
   - Elapsed derivation from anchor + paused accumulation.
   - Sleep simulation: advance the injected clock by 30 min mid-session → correct elapsed, no drift.
   - Protocol phase transitions for each method (Pomodoro loop, 52/17, Flowtime open-ended, Deep Work).
   - Countdown remaining reaches exactly 0, then rolls to next phase.

2. **Streak logic** (`features/streaks/logic`)
   - Consecutive days → current + longest streak.
   - Gap breaks streak; today-not-yet-done does NOT break it until day end.
   - Streak restore fills exactly one gap; budget enforced.
   - Month/year boundary continuity.

3. **Calendar date/color** (`features/calendar/logic/dayColor.ts` + `shared/lib/date.ts`)
   - green/yellow/red/neutral rule across all input combinations (0 tasks, all done, partial, future day).
   - `YYYY-MM-DD` day-key derivation is DST-safe and timezone-stable (test around a DST transition and near local midnight).
   - Month grid generation (leading/trailing days, week start).

**Test strategy:** Inject the clock/`now` into every time-dependent function (`(deps: { now: () => number })`) so tests are deterministic — no real timers, no `vi.useFakeTimers` gymnastics required. Keep DB out of unit tests entirely; the persistence layer is verified by manual smoke checks at each milestone's "done" criteria.

**Explicitly NOT tested automatically (manual smoke per milestone):** window transparency/AOT (visual), tray/notifications (OS integration), Drizzle↔SQL bridge (verified live in M0), autosave debounce (verified by typing + restart). These are cheaper and more reliable to eyeball once than to automate for a solo MVP.

## Code Sketches

```ts
// config/index.ts — centralized, no magic values
export const CONFIG = {
  db: { name: "productivityos.db", schemaVersion: 1 },
  timer: { tickMs: 250, heartbeatMs: 5000, stateBroadcastMs: 250 },
  floater: { defaultOpacity: 0.92, compact: { w: 240, h: 96 }, mini: { w: 160, h: 56 } },
} as const;
```

```json
// tauri.conf.json (excerpt) — the floating window
{
  "app": { "windows": [
    { "label": "main", "url": "/", "width": 1100, "height": 720, "title": "ProductivityOS" },
    { "label": "floater", "url": "/floater", "width": 240, "height": 96,
      "transparent": true, "decorations": false, "alwaysOnTop": true,
      "skipTaskbar": true, "shadow": false, "resizable": false, "visible": false }
  ]}
}
```

```css
/* transparency fix: OS window fully clear, card owns its bg */
html, body, #root { background: transparent !important; }
.floater-card {
  background: rgba(18, 18, 22, var(--floater-alpha, 0.92));
  border-radius: 16px;
}
```

```ts
// features/timer/logic/engine.ts — anchor-derived, sleep-safe, testable
type Clock = { now: () => number };
export function elapsedMs(s: TimerState, clock: Clock): number {
  if (s.status !== "running") return s.accumulatedMs;
  return s.accumulatedMs + (clock.now() - s.anchorEpochMs); // derived, never per-tick +=
}

// study methods as generic protocol config — one engine, no branching
export type Protocol = {
  id: string;
  loop: boolean;
  phases: { kind: "focus" | "break"; durationMs: number | null }[]; // null = open-ended (Flowtime)
};
export const POMODORO: Protocol = {
  id: "pomodoro", loop: true,
  phases: [{ kind: "focus", durationMs: 25*60_000 }, { kind: "break", durationMs: 5*60_000 }],
};
export const FLOWTIME: Protocol = {
  id: "flowtime", loop: false, phases: [{ kind: "focus", durationMs: null }],
};
```

```ts
// db/proxy.ts — Drizzle authors, plugin-sql executes (Risk R2)
import Database from "@tauri-apps/plugin-sql";
export async function run<T>(query: { toSQL: () => { sql: string; params: unknown[] } }) {
  const db = await Database.load(`sqlite:${CONFIG.db.name}`);
  const { sql, params } = query.toSQL();
  return db.select<T>(sql, params as unknown[]);
}
```

```rust
// src-tauri: authoritative migrations + crash-safe pragmas
tauri_plugin_sql::Builder::default()
  .add_migrations("sqlite:productivityos.db", vec![
    Migration { version: 1, description: "init",
      sql: "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
            CREATE TABLE sessions(id TEXT PRIMARY KEY, protocol TEXT,
              started_at INTEGER, last_seen_at INTEGER, ended_at INTEGER, duration_ms INTEGER);
            CREATE TABLE tasks(id TEXT PRIMARY KEY, title TEXT, status TEXT,
              created_at INTEGER, completed_at INTEGER, due_day TEXT);
            CREATE TABLE notes(day TEXT PRIMARY KEY, content TEXT, updated_at INTEGER);",
      kind: MigrationKind::Up },
  ]).build()
```

```ts
// cross-window sync — floater is a pure remote (Risk R4)
// main window (owner):
await emit("timer:state", snapshot);                 // throttled 250ms
listen<Command>("timer:command", (e) => engine.apply(e.payload));
// floater:
listen<Snapshot>("timer:state", (e) => store.set(e.payload));
await emit("timer:command", { type: "start" });
onMount(() => emit("timer:request-snapshot"));       // re-sync on reopen
```

```ts
// features/calendar/logic/dayColor.ts — pure, tested
export type DayColor = "green" | "yellow" | "red" | "neutral";
export function dayColor(d: { total: number; done: number; hasSession: boolean }): DayColor {
  if (d.total === 0 && !d.hasSession) return "neutral";
  if (d.total > 0 && d.done === d.total) return "green";
  if (d.done > 0 || d.hasSession) return "yellow";
  return "red";
}
```

## Risks

- If the Drizzle-to-Tauri-SQL `.toSQL()` bridge proves too rough (param placeholder mismatches, transaction handling), the M0 fallback is hand-written SQL strings with Drizzle types for inference only — validate this in the M0 spike before committing.
- Tauri/WebView2 transparency + always-on-top can still be covered by exclusive-fullscreen apps and may show shadow/border artifacts on some Windows builds; must be verified visually in a BUNDLED build (not just dev) at M1.
- Sleep/hibernate resume signals are not uniformly exposed; the anchor-derived elapsed approach mitigates most drift but countdown notifications firing exactly on wake may lag — acceptable for personal use.
- Two migration mechanisms (drizzle-kit vs Rust plugin) risk drift; discipline (Rust list authoritative, append-only, copy generated SQL manually) is required and easy to violate.
- Cross-window event throttling (250ms) could momentarily desync the floater under rapid start/stop; snapshot-on-mount plus command/state separation mitigates but should be smoke-tested.
- Scope creep is the biggest non-technical risk for a solo dev: the protocol builder, streak restore, and analytics each invite gold-plating — keep them minimal in the MVP.
- Skipping code signing means SmartScreen friction on any machine other than the dev's; fine for personal use but would need revisiting if ever shared.

## Open Questions

- Should the timer engine's single owner live in the React main window or be promoted into Rust? Decision taken: main window for MVP simplicity, but if the main window is closed-to-tray while the floater runs, the owner must survive — may require moving authoritative state to Rust in a later iteration.
- Streak-restore budget: how many restores allowed (per month? lifetime?) and does using a timer session alone qualify a day, or only completed tasks? Needs a product call before M5.
- Does a day with only study sessions (no tasks) count as green, or is green strictly about tasks? The calendar color rule needs this defined precisely for dayColor.ts.

