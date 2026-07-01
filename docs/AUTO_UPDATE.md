# Auto-update architecture (not enabled)

ProductivityOS is offline-first and ships **without** an updater active. The app is structured so updates can be added later without refactoring. This documents the path; nothing here runs today.

## What's already in place
- Single versioned source of truth: `version` in `tauri.conf.json` (aligned with `package.json` and `Cargo.toml`).
- Per-user NSIS installer target with app metadata (publisher, copyright, identifier).
- Stable app identifier `com.gabriel.productivityos` → stable AppData location, so updates never orphan the SQLite database.
- Append-only, versioned DB migrations applied at startup — a newer build safely migrates an older user's DB.

## To enable updates later
1. Add the updater plugin:
   - Rust: `tauri-plugin-updater` in `src-tauri/Cargo.toml`; register it in `lib.rs`.
   - JS: `@tauri-apps/plugin-updater`.
2. Generate a signing keypair: `npm run tauri signer generate`. Keep the **private key** secret (CI secret); commit only the **public key**.
3. In `tauri.conf.json`:
   - `bundle.createUpdaterArtifacts: true`
   - `plugins.updater.pubkey: "<public key>"`
   - `plugins.updater.endpoints: ["https://<host>/latest.json"]`
4. Publish per release: the signed installer + a `latest.json` manifest (version, notes, platform URLs, signature) to the endpoint (e.g. GitHub Releases).
5. On startup (or on demand), call `check()` from the updater plugin; if an update exists, `downloadAndInstall()` then relaunch.

## Constraints (keep)
- No telemetry beyond the version check the updater performs.
- No accounts/auth. The update check is anonymous.
- Migrations must remain append-only so downgrades never corrupt data.
