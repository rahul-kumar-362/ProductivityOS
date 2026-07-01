# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/OWNER/productivityos/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/productivityos/releases/tag/v0.1.0
