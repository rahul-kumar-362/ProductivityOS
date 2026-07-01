# Contributing to ProductivityOS

Thanks for your interest! ProductivityOS is an offline-first personal desktop app. Contributions that keep it **lightweight, local-only, and maintainable** are welcome.

## Getting started

```bash
git clone https://github.com/OWNER/productivityos.git
cd productivityos
npm install
npm run tauri dev
```

Prereqs: Node 20+, Rust (MSVC) + VS Build Tools ("Desktop development with C++"), Windows 11. If `cargo` isn't on PATH (PowerShell): `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`.

## Quality gates (run before every PR)

```bash
npm run lint     # ESLint — must be clean
npm test         # Vitest — timer/streak/calendar logic
npm run build    # tsc (strict) + vite build — no type errors
```

## Architecture principles (please preserve)

- **Feature-based structure.** Each feature under `src/features/<name>` owns its `components/`, `hooks/`, `services/`, `pages/`.
- **Strict layering:** component → hook → service → repository (`src/db`) / Tauri wrapper (`src/services/tauri.ts`). Components hold **no** business logic, SQL, or direct `invoke`/`Date`.
- **Time:** the only place `Date` is read is `src/db/time.ts` (+ `src/shared/lib/date.ts` for day-key math). Store UTC epoch-ms; freeze a local `YYYY-MM-DD` day key at write time.
- **Timer engine** is the single SQLite writer, hosted in the main window; the floating window is a pure remote. Don't add a second writer.
- **Centralized config** in `src/config/*` — no magic strings for events/routes/commands.
- **TypeScript strict**, no `any`, dark-first semantic tokens only (no hardcoded colors).
- **Offline-first.** No cloud, no auth, no telemetry.

## Database changes

1. Edit `src/db/schema.ts`.
2. `npx drizzle-kit generate --name <change>` → creates SQL in `src-tauri/migrations/`.
3. Append a new `Migration` (next version, append-only) in `src-tauri/src/lib.rs`. Never edit an applied migration.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`. Keep the subject ≤ 72 chars.

## Pull requests

- Keep PRs focused; describe the change and why.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Ensure lint, tests, and build all pass.
- No new runtime dependencies without justification (keep the bundle lean).
