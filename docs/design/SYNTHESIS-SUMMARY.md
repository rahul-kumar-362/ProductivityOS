# ProductivityOS — Synthesis Summary

## Decision Log

- SQLite: tauri-plugin-sql (sqlite) fronted by Drizzle sqlite-proxy; the plugin owns the ONE connection. Reject rusqlite/sqlx + hand-written commands (duplicates schema, kills type-safety, more Rust for a solo dev).
- Bridge caveat: map plugin row-objects to array-of-values with Object.values(row); route run() for writes (empty rows) and select() for reads; prefer explicit column lists.
- Migrations: drizzle-kit generate authors versioned SQL + types; the Rust plugin migration list is the runtime authority (include_str!), applied once at startup, append-only. drizzle-kit never runs against the live DB.
- Timer ownership: the MAIN WINDOW owns the engine state machine, persistence, and recovery and is the SOLE SQLite writer. Rust hosts windows/tray/notifications + a 1 Hz relay tick but does NOT write the DB. Hide-to-tray keeps the owner alive in the background.
- Cross-window sync: SQLite (durable) + Tauri emit/listen events (live), throttled to 250ms, snapshot-on-mount. Zustand is not shareable across separate WebView2 heaps. Floating window is a pure remote; commands are fire-and-forget.
- Timer timing: elapsed is DERIVED from a wall-clock anchor (accumulatedMs + now - runningSinceUtc), never accumulated per tick; UI 250ms interval is cosmetic re-render only. Survives crash/sleep/DST/jitter.
- Two-clock rule: wall-clock UTC epoch-ms persisted for history/recovery; live math clamps >=0. Recovery uses the persisted UTC heartbeat (no shared monotonic origin across process restarts).
- Crash recovery: single active-session query on bootstrap; clamp credited gap to 5min; <=90s -> restore paused with a consent toast, >90s -> finalize completed. Never auto-resume, never inflate time.
- All instants stored as UTC epoch-ms INTEGER (mode:number), NOT Drizzle timestamp mode; every day-scoped feature stores a frozen local_day TEXT (YYYY-MM-DD) computed once at write time — fixes UTC off-by-one at UTC-3.
- 11 tables, integer autoincrement PKs (except settings text-KV and day_rollup natural PK). day_rollup is BOTH the calendar-color source and the analytics cache, upserted after every task/session write.
- Exactly one live session enforced by a partial UNIQUE index on status IN ('running','paused') plus the single-owner engine.
- Study methods modeled as a generic protocol config {phases,loop}; one engine consumes all — no per-method branching. Pomodoro/Flowtime/Deep Work/52-17/custom are pure buildProtocol data.
- Floating window created at RUNTIME via WebviewWindowBuilder with visible(false), shown only after first paint via timer_window_ready — the fix for the WebView2 black-flash. Not declared statically.
- Transparency/opacity: OS window fully transparent; a rounded rgba() card owns its background; opacity is a CSS alpha variable, not native window opacity. CSS border-radius corners; no DWM shadow.
- Hide-to-tray: intercept main-window CloseRequested with prevent_close()+hide(); real quit only via tray Quit. single-instance registered first; autostart launches with --minimized.
- 4 Zustand stores: timer + tasks NOT persisted (SQLite is truth), settings + ui persisted to localStorage (settings write-through to SQLite). Elapsed never stored in state — derived via selector.
- Strict layering component -> hook -> service -> repository/tauri, enforced by ESLint no-restricted-imports; no business logic, Date, SQL, or invoke in components. db/time.ts is the only place Date is used; services/tauri.ts the only file importing @tauri-apps/api.
- Design system: raw RGB channel triplets in CSS vars consumed via rgb(var(--x)/<alpha-value>); explicit data-theme attribute (no prefers-color-scheme in CSS); render-blocking inline script + matching Tauri windowBackgroundColor for zero flash; components use only semantic tokens; useThemeColors() bridges Recharts SVG.
- Packaging: NSIS, installMode currentUser (no UAC), webviewInstallMode downloadBootstrapper, unsigned (accept one-time SmartScreen); one-click SQLite backup in Settings.
- Testing: Vitest unit tests only on timer math, streak logic, calendar date/color with an injected clock; everything else manual smoke per milestone. No CI/CD, no E2E.
- De-risk-first sequencing: persistence bridge (M0) and floating transparent AOT window (M1) before any feature UI; 9 dependency-ordered milestones each runnable via tauri dev and PR-sized.
- IDs: integer autoincrement PKs across the schema (chosen over UUID text keys) — smaller, simpler, consistent with the 11-table design.

## Roadmap

### M0 — Skeleton + persistence spike — Prove the riskiest integration first: a running Tauri window reading/writing SQLite through Drizzle-typed queries over the plugin-sql sqlite-proxy bridge.
- Tauri 2 + Vite + React 18 + TS strict (noUncheckedIndexedAccess, no-any ESLint) + Tailwind + Zustand + React Router scaffold
- tauri-plugin-sql installed; Rust migration list wired with drizzle-kit-generated 0001_init.sql (pragmas: WAL, foreign_keys=ON, synchronous=NORMAL, busy_timeout)
- The Drizzle sqlite-proxy <-> plugin-sql bridge in db/client.ts with Object.values(row) mapping + run/select method routing; integration test round-tripping a multi-column row
- config/ centralized constants (DB name, app name, default opacity, tick intervals); dark-first token scaffolding
- ESLint no-restricted-imports boundary rule (components cannot import db/services/@tauri-apps)

### M1 — Floating timer window — The signature feature's hardest part: a transparent, always-on-top, draggable, frameless second window with adjustable opacity, before any timer logic exists.
_Depends on:_ M0
- Runtime WebviewWindowBuilder (floating.rs): transparent, decorations:false, alwaysOnTop, skipTaskbar, shadow:false, visible:false
- Anti-black-flash gate: timer_window_ready command shows the window only after first React paint; html/body transparent; rounded rgba card owns its background
- data-tauri-drag-region header drag; interactive controls opt out of dragging
- Opacity slider bound to a CSS alpha variable (not native window opacity); compact<->mini via setSize presets
- /float sibling route (outside main shell); tauri-plugin-window-state for position/size persistence

### M2 — Timer & session engine (pure logic + crash safety) — Framework-agnostic pure-TS engine with timestamp derivation, protocol config model, and crash recovery, hosted in the main window as the sole DB writer.
_Depends on:_ M1
- features/timer/logic/engine.ts: anchor-derived elapsed (accumulatedMs + now - runningSinceUtc), never per-tick; injected clock for testability
- Study methods as generic protocol config {phases:[{kind,durationMs|null}],loop}; Pomodoro/Flowtime/Deep Work/52-17/custom via buildProtocol, one engine no branching
- sessions + session_intervals persistence: write session row on start, 15s heartbeat (lastTickAt + accumulatedMs), transition writes in transactions
- Crash recovery on bootstrap: single active-session query, clamped gap credit (5min), 90s live threshold -> restore paused vs finalize completed; never auto-resume/inflate
- Vitest unit tests: elapsed derivation, 30-min-sleep simulation, protocol phase transitions, countdown-to-zero rollover

### M3 — Floating <-> main window state sync — Both windows show identical live timer state and can both control it, with one owner and no double-counting.
_Depends on:_ M2
- Main window = sole engine owner + sole DB writer; floating window = pure remote control
- Rust 1 Hz relay tick + transition-driven emit('timer:state', anchor snapshot), throttled 250ms
- Fire-and-forget commands: windows invoke('timer:command') and wait for the broadcast; no local state mutation
- Snapshot-on-mount (get_engine_state) so the floater re-syncs after reopen or WebView reload
- Display-only derived selectors (useDerivedElapsed) reading the anchor; elapsed never stored in state

### M4 — Tasks (pending / completed / history) — Daily task management with clean layer separation and full audit trail.
_Depends on:_ M0
- tasks + task_events schema; repositories set local_day + created_at/updated_at and append events
- Logic layer: create, complete, uncomplete, edit, soft-delete, carry-over/roll-to-today
- Three routes: Pending, Completed, History (presentation only; all logic in services/hooks)
- Optimistic toggle with rollback; day_rollup recompute on every task mutation

### M5 — Calendar + streaks (the date-math milestone) — Monthly color-coded calendar and the streak system + restore — the two most bug-prone date computations, built and unit-tested together.
_Depends on:_ M4
- db/time.ts as the single day-boundary authority: local-tz YYYY-MM-DD keys computed once, DST/timezone-safe
- Calendar color as pure fn reading day_rollup: green(all done)/yellow(partial)/red(none)/none(no data); one range query per month
- Streak logic (pure): current + longest; today-not-yet-done doesn't break until day end; streak_days ledger + limited restore (settings budget)
- Custom calendar grid (no Recharts yet); streak_state singleton updated on qualifying writes
- Vitest: color rule across all combos, streak across month boundaries + after restore, day-key derivation around DST and local midnight

### M6 — Daily notes (markdown, autosave) — One markdown note per day with debounced autosave.
_Depends on:_ M0
- daily_notes schema (localDay unique); upsert-by-day repository
- Debounced autosave (~800ms) + save on blur and window-close
- Lightweight markdown render with a view/edit toggle (no heavy editor)

### M7 — Analytics, tray & notifications — Read-only insights over existing data plus OS integration.
_Depends on:_ M3
- Recharts views (study hours, task completion rate, streak trend) with useThemeColors() for SVG token colors; aggregation in analytics/logic (pure), charts dumb
- System tray (Rust setup): menu items emit tray://* events; left-click toggles dashboard; hide-to-tray on CloseRequested
- Native notifications for phase transitions / session end; permission requested once
- tauri-plugin-single-instance (relaunch focuses running app); autostart plumbing

### M8 — Settings, polish, packaging — Settings page, light animation polish, and a shippable Windows installer.
_Depends on:_ M5,M6,M7
- Settings: default opacity, default protocol, notification toggles, theme (dark default), start-on-boot (autostart), data-location display, streak-restore budget; write-through to SQLite
- Framer Motion: light transitions only (window state changes, list add/remove)
- NSIS installer via Tauri bundler (currentUser, downloadBootstrapper, lzma, unsigned), app icon + metadata + version
- One-click SQLite file backup/export in Settings
- Full smoke pass on a clean-ish Windows profile: installs, launches <2s, all features work, settings persist

## Risks

- WebView2 renders an opaque black/white box on transparent always-on-top windows — Mitigation: create the floating window at runtime with visible(false) and reveal only after first paint via timer_window_ready; keep OS window fully transparent with a rounded rgba() card owning its background; set Tauri windowBackgroundColor to #09090C; verify AOT against a maximized app in a BUNDLED build (not just dev) at M1.
- Drizzle sqlite-proxy expects arrays of column values but plugin-sql returns row-objects, so the Object.values(row) bridge could silently misorder columns on a driver update — Mitigation: prefer explicit column lists in every Drizzle select, route writes through execute() and reads through select(), and add an M0 integration test that round-trips a multi-column row.
- Timer under-counts across sleep/hibernate/WebView2 background throttling if elapsed is tick-accumulated — Mitigation: never accumulate per tick; derive elapsed from a persisted wall-clock anchor (accumulatedMs + now - runningSinceUtc) with a 15s heartbeat; the 250ms interval only re-renders.
- Two windows or a dual writer could double-count sessions or corrupt SQLite — Mitigation: exactly one owner (main window) is the sole DB writer over the single plugin-sql connection; floating window is a pure remote (emit command / listen state); single-instance prevents a competing owner; partial UNIQUE index enforces one active session.
- Crash-recovery gap threshold is a heuristic — a long OS sleep could over-credit focus or a brief crash under-credit it — Mitigation: clamp credited gap to 5min and split at a 90s live threshold (<=90s restore paused with consent toast, >90s finalize completed); centralize both constants in config for tuning after real use.
- day_rollup / streak drift if any write path forgets to recompute — Mitigation: funnel every task/session mutation through repository functions that always recompute the affected day and streak, plus a startup 'reconcile last N days' safety pass.
- Main window owns the engine but can be closed to tray while the floater runs — Mitigation: hide-to-tray uses prevent_close()+hide() so the WebView2 (and thus the engine + heartbeat) stays alive; only tray Quit destroys it; revisit promoting authoritative state to Rust only if a future need proves this insufficient.
- Two migration mechanisms (drizzle-kit vs Rust plugin list) can drift — Mitigation: the Rust plugin list is the sole runtime authority, migrations are append-only with stable incrementing versions, generated SQL is copied verbatim, and a startup assertion logs the applied schema version.
- Unsigned installer trips SmartScreen and downloadBootstrapper needs network if WebView2 is absent — Mitigation: accept the one-time 'Run anyway' for a personal app (no EV cert); Windows 11 ships WebView2 so risk is low; note fixedVersion/embedBootstrapper as fallbacks if an offline install is ever required.
- Solo-dev scope creep (protocol builder, streak restore, analytics invite gold-plating) is the biggest non-technical risk — Mitigation: keep each minimal per the MVP feature list, ship the 9 milestones in dependency order, and treat the decision log as the guardrail against re-litigating settled choices.
- Recharts SVG cannot consume rgb(var()) with alpha, so charts added carelessly render wrong colors — Mitigation: route all chart colors through a useThemeColors() hook that resolves tokens to concrete rgb() strings on data-theme change; document this for the analytics milestone.
