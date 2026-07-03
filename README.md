<div align="center">

# ProductivityOS

**Plan · focus · execute · improve.**

A personal, offline-first Windows desktop productivity app — a floating focus timer, tasks, a color-coded calendar, streaks, daily notes and analytics, all in one lightweight native app. Local-only data. No accounts, no cloud, no tracking.

</div>

---

## Features

- **Floating always-on-top timer** — transparent, draggable, click-through capable, adjustable opacity. A native desktop widget.
- **Crash-safe timer engine** — timestamp/anchor based, survives crash / sleep / restart without inflating time. Study methods (Pomodoro, 52/17, Deep Work, Flowtime) modeled as protocols. Permanent session history.
- **Per-task timer + progress ring** — set a time estimate on any task, focus on it from a circular ring, and watch % done fill as sessions complete.
- **Tasks** — Today / Pending / Completed, inline rename, optimistic toggle, full audit trail.
- **Color-coded monthly calendar** — green = all tasks done · yellow = partial · red = none, with a per-day detail panel.
- **Streaks** — current & longest, configurable qualification rule, and a restore-a-missed-day feature.
- **Daily notes** — one per day, autosave.
- **Analytics** — focus hours, task completion, streaks (last 14 days).
- **System tray + native notifications**, hide-to-tray, launch-on-boot, single-instance.
- **Dark-first theme** (dark / light / system), settings, instant theme switch with no flash.

## Screenshots

> _Add screenshots to `docs/screenshots/` and update the links below._

| Dashboard | Calendar | Analytics |
| --- | --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Calendar](docs/screenshots/calendar.png) | ![Analytics](docs/screenshots/analytics.png) |

## Tech stack

| Layer | Choice |
| --- | --- |
| Desktop shell | **Tauri 2** (Rust + WebView2) |
| UI | **React 19** + **TypeScript** (strict) + **Vite** |
| Styling | **Tailwind CSS** (semantic CSS-variable tokens) |
| State | **Zustand** |
| Data | **Drizzle ORM** over **SQLite** (via `tauri-plugin-sql`) |
| Charts | **Recharts** · Icons **Lucide** · Routing **React Router** |
| Tests / Lint | **Vitest** · **ESLint** (typescript-eslint + react-hooks) |

## Folder structure

```
src/
  config/        centralized constants (events, routes, commands, timer, theme)
  db/            Drizzle schema, client (sqlite-proxy bridge), repositories, time
  features/      feature modules — app, timer, tasks, calendar, streaks, notes,
                 analytics, settings, dashboard
  shared/        UI primitives + lib helpers (date, format, result)
  stores/        Zustand stores (timer, settings)
  lib/theme/     theme application + Recharts colour bridge
  windows/       MainShell (sidebar) + FloatWindow shells
  styles/        tokens.css + globals.css
src-tauri/
  src/           Rust — windows, tray, notifications, commands, plugin wiring
  migrations/    drizzle-kit output, applied at startup by tauri-plugin-sql
  capabilities/  Tauri permission set
docs/design/     per-subsystem architecture design docs
ARCHITECTURE.md  synthesized architecture overview
```

## Prerequisites

- **Node.js** 20+ and npm
- **Rust** (MSVC toolchain) + **Visual Studio Build Tools** ("Desktop development with C++")
- **Windows 11** (WebView2 ships with it)

## Installation (end users)

Download [`ProductivityOS_0.2.0_x64-setup.exe`](https://github.com/rahul-kumar-362/ProductivityOS/releases/latest) from the [Releases page](https://github.com/rahul-kumar-362/ProductivityOS/releases) and run it. It installs per-user (no admin). The installer is unsigned, so Windows SmartScreen shows a one-time **More info → Run anyway**.

## Development

```bash
npm install
npm run tauri dev
```

> If `cargo` isn't on your PATH (PowerShell): `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`.

Quality gates:

```bash
npm run lint     # ESLint (0 errors expected)
npm test         # Vitest — timer engine, streak logic, calendar date math
npm run build    # tsc (strict) + vite build
```

## Build instructions

```bash
npm run tauri build
```

Outputs a per-user NSIS installer at:

```
src-tauri/target/release/bundle/nsis/ProductivityOS_0.2.0_x64-setup.exe
```

## Data & migrations

- SQLite lives in `%APPDATA%\com.rahulborana.productivityos\productivityos.db` (WAL mode), created automatically on first launch.
- Schema is authored in Drizzle (`src/db/schema.ts`). After a schema change:
  ```bash
  npx drizzle-kit generate --name <change>
  ```
  Then append the generated SQL as a new `Migration` in `src-tauri/src/lib.rs` (append-only). Migrations apply at startup.

## Roadmap

- [ ] Vendor Inter + JetBrains Mono fonts locally (currently system font stack)
- [ ] Code-split the analytics/Recharts bundle
- [ ] Wire auto-updates (architecture documented in [`docs/AUTO_UPDATE.md`](docs/AUTO_UPDATE.md); needs a signing key + release endpoint)
- [ ] Study Methods Center page (methods currently exposed via the timer picker)
- [ ] Data export / backup UI
- [ ] Accessibility pass (keyboard/ARIA audit)

## License

[All Rights Reserved](LICENSE) © 2026 Rahul Borana — publicly viewable for portfolio/educational purposes only; no reuse, modification, or redistribution without explicit written permission.
