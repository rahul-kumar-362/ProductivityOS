# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-03

### Fixed
- App-wide freeze (every page stuck on loading skeletons until the process was killed) whenever the floating timer window was created — on launch, from the tray, or via the dashboard "Open floating timer" button. The floating window is now declared statically and only shown/hidden, never rebuilt at runtime, which removes the Windows WebView2 event-loop deadlock that wedged all IPC.
- Floating timer now remembers its position and size across restarts without flashing on startup.

### Added
- Custom study methods: create, edit and delete your own interval methods (focus/break/long-break minutes, cycles, auto-start) or count-up methods in **Settings → Study methods**. Built-in methods (Pomodoro, 52/17, Deep Work, Flowtime) stay locked.
- Default-method picker: choose which study method the floating timer's Start button launches (was hardcoded to Pomodoro). Changes apply immediately, no restart needed.

### Changed
- Floating timer idle readout shows `--:--` instead of the Pomodoro-specific `25:00`.

## [0.1.0] - 2026-07-02

Initial MVP.

### Added
- Floating always-on-top timer window (transparent, draggable, click-through, adjustable opacity; compact/mini states).
- Crash-safe timer/session engine — timestamp/anchor based; survives crash, sleep and restart without inflating time. Study methods (Pomodoro, 52/17, Deep Work, Flowtime) modeled as protocols. Permanent session history.
- Per-task timer with a circular progress ring (spent ÷ estimate); focus sessions credit the linked task.
- Task management — Today / Pending / Completed, inline rename, optimistic toggle, append-only audit trail.
- Monthly color-coded calendar (green/yellow/red) with a per-day detail panel.
- Streak system — current & longest, configurable qualification rule, restore-a-missed-day.
- Daily notes — one per day, debounced autosave.
- Analytics — focus hours, task completion, streaks (last 14 days).
- System tray + native desktop notifications, hide-to-tray, launch-on-boot, single-instance.
- Dark-first theming (dark / light / system) with no-flash startup; settings page.
- Local SQLite (WAL) via Drizzle ORM; migrations applied at startup by `tauri-plugin-sql`.

[Unreleased]: https://github.com/rahul-kumar-362/ProductivityOS/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/rahul-kumar-362/ProductivityOS/releases/tag/v0.2.0
[0.1.0]: https://github.com/rahul-kumar-362/ProductivityOS/releases/tag/v0.1.0
