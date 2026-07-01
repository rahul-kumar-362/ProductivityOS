# Design: tauri-integration

> Complete Tauri 2 (WebView2) desktop integration for ProductivityOS: a main dashboard window plus a runtime-created transparent, always-on-top, click-through-capable floating timer window; system tray + native notifications; single-instance, autostart, hide-to-tray; and SQLite via tauri-plugin-sql wired to Drizzle's sqlite-proxy async driver. It resolves the well-known Windows 11 WebView2 transparency caveats (black-background flash, click-through, drag regions) and gives production-ready tauri.conf.json, Rust command stubs, and NSIS installer config. The chosen SQLite approach (tauri-plugin-sql + Drizzle proxy) minimizes Rust surface for a solo maintainer while keeping type-safe schema/migrations in TypeScript.

## Decisions

- Do NOT declare the floating timer window statically in tauri.conf.json; create it at runtime with WebviewWindowBuilder using .visible(false) and reveal only after first paint via a timer_window_ready command — this is the fix for the Windows/WebView2 black-flash on transparent windows.
- SQLite: use tauri-plugin-sql (sqlite feature) fronted by Drizzle's sqlite-proxy async driver. Reject rusqlite/sqlx + hand-written commands because it duplicates schema, abandons Drizzle type-safety, and adds Rust surface a solo maintainer must own.
- Bridge caveat locked: the SQL plugin returns row objects but sqlite-proxy needs arrays of column values — map with Object.values(row); route INSERT/UPDATE/DELETE through execute() returning empty rows, SELECT through select().
- Migrations authored with drizzle-kit (TS schema is source of truth) but APPLIED by the plugin's Rust-side Migration list via include_str! — one ordered, idempotent runner at startup.
- Opacity control implemented as CSS surface-alpha driven by a slider (Rust command just emits the value), not native layered-window alpha — simpler, version-stable, visually identical for this use case.
- Hide-to-tray: intercept main window CloseRequested with api.prevent_close() + window.hide(); real quit only via tray 'Quit' -> app.exit(0). Keeps the timer/session engine alive in background.
- Register tauri-plugin-single-instance FIRST; on second launch focus the existing main window. Autostart launches with --minimized and the setup hook hides the main window on boot.
- Use tauri-plugin-window-state for floating (and main) window position/size persistence and multi-monitor restore; layer custom 16px edge-snapping using currentMonitor()/availableMonitors() in logical pixels.
- NSIS installer: installMode currentUser (no UAC), webviewInstallMode downloadBootstrapper (small installer, Evergreen WebView2), lzma compression. Unsigned is an accepted trade-off for a personal app.
- Tauri 2 is deny-by-default: enumerate exact permissions in capabilities/default.json (set-always-on-top, set-ignore-cursor-events, start-dragging, set-position, sql, notification, autostart, window-state) scoped to windows [main, floating-timer].
- Keep Rust thin: window lifecycle + tray + plugin wiring + 4 commands only. All business logic stays in TS feature modules; tray menu items emit tray://* events the frontend reacts to.

## Tauri 2 Desktop Integration — ProductivityOS

Greenfield (`C:\ProductivityOS` empty). Everything below is implementation-ready. Target: Tauri 2.x, WebView2 (Evergreen) on Windows 11, React 18 + Vite frontend.

### 0. Crate + plugin manifest

`src-tauri/Cargo.toml` dependencies (pin to Tauri 2 line):

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-notification = "2"
tauri-plugin-single-instance = "2"
tauri-plugin-autostart = "2"
tauri-plugin-window-state = "2"   # position/size persistence, handles multi-monitor
tauri-plugin-opener = "2"          # open dashboard / external links
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(windows)'.dependencies]
# only if you need raw HWND tweaks; usually not required
```

Frontend npm packages: `@tauri-apps/api`, `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-autostart`, `@tauri-apps/plugin-window-state`, `drizzle-orm`.

---

### 1. `tauri.conf.json` — main window + capabilities

Key decision: **do NOT declare the floating timer window statically**. Declaring a transparent+alwaysOnTop window in `app.windows` causes the WebView2 black-flash on cold start (window paints before the web content sets a transparent body). Create it at runtime with `WebviewWindowBuilder` after the app is ready, with `visible: false` until first paint.

```jsonc
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ProductivityOS",
  "version": "0.1.0",
  "identifier": "ar.com.synagro.productivityos",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "ProductivityOS",
        "width": 1100,
        "height": 720,
        "minWidth": 880,
        "minHeight": 560,
        "resizable": true,
        "center": true,
        "decorations": true,
        "transparent": false,
        "visible": true,
        "theme": "Dark"
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
      "capabilities": ["default"]
    },
    "trayIcon": {
      "id": "main-tray",
      "iconPath": "icons/tray.png",
      "iconAsTemplate": false,
      "tooltip": "ProductivityOS",
      "menuOnLeftClick": false
    }
  },
  "plugins": {
    "sql": {
      "preload": ["sqlite:productivityos.db"]
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["English", "SpanishInternational"],
        "displayLanguageSelector": false
      }
    }
  }
}
```

Notes:
- `identifier` uses reverse-DNS from the developer's org domain; it seeds the app-data dir where the SQLite file lives (`%APPDATA%\ar.com.synagro.productivityos`).
- `installMode: currentUser` → no UAC prompt, per-user install, matches single-user personal app.
- `menuOnLeftClick: false` so left-click can toggle the dashboard and right-click opens the menu (wired in Rust below).

`src-tauri/capabilities/default.json` (permission surface — Tauri 2 is deny-by-default):

```jsonc
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main", "floating-timer"],
  "permissions": [
    "core:default",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-ignore-cursor-events",
    "core:window:allow-start-dragging",
    "core:window:allow-set-position",
    "core:window:allow-outer-position",
    "core:window:allow-set-size",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-close",
    "core:webview:allow-set-webview-position",
    "core:app:allow-set-theme",
    "sql:default",
    "sql:allow-execute",
    "sql:allow-select",
    "notification:default",
    "autostart:default",
    "window-state:default"
  ]
}
```

Opacity is set via a custom Rust command (see §5) because Tauri does not expose a stable cross-window opacity API; that command is authorized by `core:default`/being invoked, not a per-permission entry.

---

### 2. Floating timer window — creation + Windows transparency caveats

**The caveats (Windows 11 / WebView2) and the fixes:**

1. **Black background flash on show.** WebView2 renders opaque black until the DOM declares transparency. Fix: build the window with `visible(false)`, set the HTML/body background to `transparent` in CSS from the very first paint, then `show()` from the frontend only after `document` is painted (call a `timer_window_ready` command on mount). Also give the WebView2 a transparent background hint via the builder (`.transparent(true)` handles most of it in Tauri 2, but the visible-after-ready guard is what kills the flash).
2. **Click-through requires transparency + no decorations.** `set_ignore_cursor_events(true)` only behaves well on a `transparent(true), decorations(false)` window. When click-through is on, the window cannot receive mouse events at all — so toggling must be driven from the tray or a global shortcut, or by a small always-interactive "grip" region (see §3).
3. **Rounded corners / DWM shadow.** A borderless transparent window loses the Win11 rounded corners + shadow. Accept square corners (Linear/Raycast compact aesthetic) OR round via CSS `border-radius` on the transparent body — CSS rounding is the pragmatic choice; skip native DWM corner APIs.
4. **Sub-pixel drag jitter** with `data-tauri-drag-region` on transparent windows: keep the drag region a solid (even if translucent) element, not `pointer-events:none`.
5. **Fractional DPI scaling** (Win11 150%): always work in logical pixels via `LogicalPosition`/`LogicalSize` to avoid drift across monitors.

Rust — create on demand (tray "Show timer" or app startup based on a persisted "was open" flag):

```rust
// src-tauri/src/floating.rs
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
    LogicalSize, LogicalPosition,
};

pub const FLOATING_LABEL: &str = "floating-timer";

pub fn open_floating_timer(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(FLOATING_LABEL) {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        app,
        FLOATING_LABEL,
        WebviewUrl::App("index.html#/floating".into()), // hash route -> floating UI
    )
    .title("Timer")
    .inner_size(240.0, 96.0)      // compact default; mini state = 140x56 via resize
    .min_inner_size(120.0, 48.0)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)                // avoid DWM shadow artifacts on transparent win
    .visible(false)               // <-- key: no black flash; frontend shows after paint
    .build()?;

    // window-state plugin will restore prior position; if first run, offset top-right
    let _ = win.set_size(LogicalSize::new(240.0, 96.0));
    Ok(())
}
```

Frontend gate against the flash (floating window entry, e.g. in the `#/floating` route mount):

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";

// CSS: html,body { background: transparent; margin:0; } and the app shell paints
// its own translucent surface. Show only after first paint.
requestAnimationFrame(async () => {
  const w = getCurrentWindow();
  await w.show();
});
```

---

### 3. Floating window interactions

**Drag region** — in the floating React UI, the top strip / whole compact surface:

```tsx
// The draggable chrome. Interactive controls inside must opt OUT of dragging.
<div data-tauri-drag-region className="flex h-full items-center px-3 select-none">
  <span data-tauri-drag-region className="tabular-nums text-sm">{display}</span>
  {/* buttons must set data-tauri-drag-region={false} or dragging swallows clicks */}
  <button onClick={toggle} className="ml-auto" data-tauri-drag-region={false as unknown as string}>
    {/* ...icon */}
  </button>
</div>
```
Prefer explicit `onmousedown` → `getCurrentWindow().startDragging()` inside a handler if you need conditional drag; but `data-tauri-drag-region` is the standard path.

**Always-on-top toggle** (pin/unpin from settings or tray):
```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
await getCurrentWindow().setAlwaysOnTop(pinned);
```

**Click-through** (ghost mode). Because a fully click-through window can't un-toggle itself, drive it from the tray/global-shortcut, and expose a re-enable path:
```ts
await getCurrentWindow().setIgnoreCursorEvents(enabled); // true = clicks pass through
```
Pragmatic UX: keep a 16px "grip" corner that always stays interactive by only turning on click-through over the transparent padding, not the content — implement by toggling per interaction rather than a persistent ghost, since WebView2 can't do per-region hit-testing reliably. MVP: bind click-through to a global shortcut (`Ctrl+Alt+G`) via `tauri-plugin-global-shortcut` (add if you want it; otherwise tray toggle).

**Opacity control** — custom Rust command (§5), slider in floating settings 30–100%.

**Edge snapping + position persistence + multi-monitor:** use `tauri-plugin-window-state` for automatic save/restore of the floating window's position and size across restarts (it restores onto the correct monitor and clamps to visible area if a monitor was unplugged). Layer custom edge-snapping on top of the drag:

```ts
import { getCurrentWindow, availableMonitors, currentMonitor } from "@tauri-apps/api/window";

const SNAP = 16; // logical px

async function snapToEdges() {
  const w = getCurrentWindow();
  const mon = await currentMonitor();          // monitor under the window
  if (!mon) return;
  const pos = await w.outerPosition();          // physical
  const size = await w.outerSize();
  const s = mon.scaleFactor;
  const x = pos.x / s, y = pos.y / s;           // to logical
  const mw = mon.size.width / s, mh = mon.size.height / s;
  const ox = mon.position.x / s, oy = mon.position.y / s;

  let nx = x, ny = y;
  if (Math.abs(x - ox) < SNAP) nx = ox;
  if (Math.abs((x + size.width / s) - (ox + mw)) < SNAP) nx = ox + mw - size.width / s;
  if (Math.abs(y - oy) < SNAP) ny = oy;
  if (Math.abs((y + size.height / s) - (oy + mh)) < SNAP) ny = oy + mh - size.height / s;

  if (nx !== x || ny !== y) {
    const { LogicalPosition } = await import("@tauri-apps/api/window");
    await w.setPosition(new LogicalPosition(nx, ny));
  }
}
// call on the window 'tauri://move' / moved event (debounced), and on move-end.
getCurrentWindow().onMoved(() => { /* debounce */ snapToEdges(); });
```
`availableMonitors()` gives multi-monitor bounds if you later add "snap to any edge across monitors". `currentMonitor()` keeps snapping correct when the window sits on a secondary display.

**Compact ↔ mini states**: just two `setSize` presets (240×96 compact, 140×56 mini) persisted in settings; window-state restores last-used size, a Zustand flag tracks which preset the UI renders.

---

### 4. System tray + notifications

Tray built in Rust `setup` so it exists before the first window is shown; menu items emit events / call helpers.

```rust
// src-tauri/src/tray.rs
use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
};
use crate::floating::open_floating_timer;

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open   = MenuItem::with_id(app, "open",   "Open dashboard", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start / Pause timer", true, Some("CmdOrCtrl+Alt+P"))?;
    let quick  = MenuItem::with_id(app, "quick",  "Quick add task", true, Some("CmdOrCtrl+Alt+N"))?;
    let sep    = PredefinedMenuItem::separator(app)?;
    let quit   = MenuItem::with_id(app, "quit",   "Quit ProductivityOS", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &toggle, &quick, &sep, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("ProductivityOS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open"   => show_main(app),
            "toggle" => { let _ = app.emit("tray://timer-toggle", ()); }   // frontend reacts
            "quick"  => { show_main(app); let _ = app.emit("tray://quick-add", ()); }
            "quit"   => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up, ..
            } = event {
                let app = tray.app_handle();
                toggle_main(app);   // left-click toggles dashboard
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus();
    }
}
fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
        else { let _ = w.show(); let _ = w.set_focus(); }
    }
}
```

Frontend listens for `tray://timer-toggle` / `tray://quick-add` and drives the timer/task logic (keeps business logic out of Rust — Rust just relays intent).

**Notifications** (session end, break start, streak-at-risk) — frontend, permission-checked:

```ts
import {
  isPermissionGranted, requestPermission, sendNotification,
} from "@tauri-apps/plugin-notification";

export async function notify(title: string, body: string) {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title, body });
}
```

---

### 5. Custom Rust commands (opacity, ready-gate, floating control)

```rust
// src-tauri/src/commands.rs
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

/// Opacity 0.0..=1.0. Tauri has no stable public opacity API, so we clamp and
/// use the window's set_opacity if available on the platform build; on Windows
/// this maps to a layered-window alpha. Keep it simple & guarded.
#[tauri::command]
pub fn set_window_opacity<R: Runtime>(window: WebviewWindow<R>, opacity: f64) -> Result<(), String> {
    let a = opacity.clamp(0.30, 1.0);
    // Tauri 2 exposes set_opacity on some targets; if not present in your version,
    // fall back to a CSS variable driven from the frontend (recommended, simplest):
    // emit to the frontend and let CSS opacity handle the surface.
    window.emit("floating://opacity", a).map_err(|e| e.to_string())
}

/// Called by the floating UI right after first paint so we can reveal without flash.
#[tauri::command]
pub fn timer_window_ready<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_timer(app: AppHandle) -> Result<(), String> {
    crate::floating::open_floating_timer(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_click_through<R: Runtime>(window: WebviewWindow<R>, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())
}
```

Decision on opacity: **prefer CSS opacity on the translucent surface** (drive a `--surface-alpha` variable from the slider) over a native layered-window alpha — it's simpler, avoids per-Tauri-version API churn, and looks identical for this use case. Reserve the native `set_opacity` path only if you want the whole window (including WebView2 compositor) to fade. The command above emits to the frontend; the React layer sets the CSS var.

---

### 6. `lib.rs` — wiring plugins, single-instance, autostart, hide-to-tray

```rust
// src-tauri/src/lib.rs
mod tray; mod floating; mod commands;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single instance MUST be registered first
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),   // launch hidden on boot
        ))
        .invoke_handler(tauri::generate_handler![
            commands::set_window_opacity,
            commands::timer_window_ready,
            commands::open_timer,
            commands::set_click_through,
        ])
        .setup(|app| {
            tray::build_tray(app.handle())?;

            // Hide-to-tray on boot if started with --minimized (autostart)
            let minimized = std::env::args().any(|a| a == "--minimized");
            if let Some(main) = app.get_webview_window("main") {
                if minimized { let _ = main.hide(); }
            }
            Ok(())
        })
        // Intercept main-window close -> hide to tray instead of quitting
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running ProductivityOS");
}
```

- **Single instance**: second launch focuses the running instance (critical for autostart + double-click).
- **Autostart**: enabled/disabled from the Settings page via `@tauri-apps/plugin-autostart` (`enable()/isEnabled()`), launches with `--minimized`.
- **Run in background / hide-to-tray**: close = hide, real quit only via tray "Quit" (`app.exit(0)`). The timer/session engine keeps running because the process stays alive.

Frontend autostart toggle:
```ts
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
```

---

### 7. SQLite — RECOMMENDATION: `tauri-plugin-sql` + Drizzle `sqlite-proxy`

**Chosen: `tauri-plugin-sql` (SQLite) fronted by Drizzle's `sqlite-proxy` async driver.** Reject the rusqlite/sqlx + hand-written `#[tauri::command]` approach.

Justification (solo maintainer, MVP, stack mandates Drizzle):
- The stack already commits to **Drizzle**. Drizzle's schema + `drizzle-kit` migrations live in TypeScript. `sqlite-proxy` lets Drizzle generate SQL and hand it to any executor — here, the Tauri SQL plugin — so you keep one source of truth for schema/types and zero hand-written CRUD in Rust.
- rusqlite/sqlx would mean **writing and maintaining a bespoke `#[tauri::command]` per query** (or a generic SQL bridge, which reinvents exactly what the plugin already provides) AND duplicating the schema in Rust migrations. That's more Rust surface, more serde boundary bugs, and abandons Drizzle's type-safety — the opposite of "maintainable by one developer, don't over-engineer."
- The plugin gives connection management, a `sqlite:` URL scheme rooted in app-data, and a built-in migration runner; `preload` opens the DB at startup so cold reads are fast (<2s startup budget respected).
- Trade-off accepted: the proxy path is async and slightly less raw-throughput than in-process rusqlite. For a single-user personal app with small local data, this is irrelevant. If one hot analytics query ever needs it, add a single targeted `#[tauri::command]` later — but do not start there.

**Wiring** — a Drizzle client backed by the plugin:

```ts
// src/data/db.ts
import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

const DB_URL = "sqlite:productivityos.db"; // resolves under %APPDATA%\<identifier>

let sqlite: Awaited<ReturnType<typeof Database.load>> | null = null;
async function conn() {
  if (!sqlite) sqlite = await Database.load(DB_URL);
  return sqlite;
}

export const db = drizzle(
  // query executor: SELECT-style, must return { rows: any[][] } (array-of-arrays)
  async (sql, params, method) => {
    const c = await conn();
    if (method === "run") {
      await c.execute(sql, params);
      return { rows: [] };
    }
    // plugin's select returns array of ROW OBJECTS; proxy needs array-of-VALUES
    const rowsObj = await c.select<Record<string, unknown>[]>(sql, params);
    const rows = rowsObj.map((r) => Object.values(r));
    return { rows: method === "get" ? (rows[0] ? [rows[0]] : []) : rows };
  },
  // batch executor (for transactions the proxy composes)
  async (queries) => {
    const c = await conn();
    const out: { rows: unknown[][] }[] = [];
    for (const q of queries) {
      const rowsObj = await c.select<Record<string, unknown>[]>(q.sql, q.params);
      out.push({ rows: rowsObj.map((r) => Object.values(r)) });
    }
    return out;
  },
  { schema, casing: "snake_case" }
);
```

Caveat baked into the code above: the Tauri SQL plugin returns **row objects**, but `sqlite-proxy` expects **arrays of column values in SELECT order**. The `Object.values()` mapping bridges this. For `INSERT/UPDATE/DELETE` route through `execute` and return empty rows. Column ordering from `Object.values` matches `SELECT *` / explicit column order because the plugin preserves result order — if you ever hit a mismatch, switch those queries to explicit column lists.

**Schema + migrations**: author in Drizzle (`src/data/schema.ts`), generate SQL with `drizzle-kit generate`, and run them through the plugin's Rust-side migration list (deterministic, versioned) — register migrations in the `tauri_plugin_sql::Builder`:

```rust
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init",
        sql: include_str!("../migrations/0001_init.sql"), // produced by drizzle-kit
        kind: MigrationKind::Up,
    }]
}
// .plugin(SqlBuilder::default().add_migrations("sqlite:productivityos.db", migrations()).build())
```
This keeps `drizzle-kit` as the schema authoring tool while the plugin owns applying migrations at startup (single, ordered, idempotent) — no separate migration runner in JS.

---

### 8. Dev vs production config + NSIS installer

**Dev vs prod** (already partly in `build`):
- Dev: `devUrl: http://localhost:1420`, `beforeDevCommand: npm run dev` (Vite HMR); the transparent floating window works in dev but the black-flash guard matters more in prod (cold WebView2). Set Vite `server.port: 1420, strictPort: true, clearScreen: false`.
- Prod: `frontendDist: ../dist`, `beforeBuildCommand: npm run build`. Assets served via Tauri's `asset:`/`tauri://` protocol — CSP already allows `asset:` for images.
- Gate any devtools/logging behind `#[cfg(debug_assertions)]` (e.g. `window.open_devtools()` only in debug). Use `tauri-plugin-log` optionally in dev.
- WebView2: rely on **Evergreen bootstrapper** (default) so the installer downloads/updates the runtime if missing — do not embed a fixed runtime (keeps installer small; Win11 ships WebView2 anyway).

**NSIS installer basics** (in `bundle.windows.nsis`, plus `bundle` root):
```jsonc
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "publisher": "Synagro",
  "copyright": "© 2026 Gabriel Alaniz",
  "shortDescription": "Personal productivity OS",
  "icon": ["icons/icon.ico"],
  "windows": {
    "webviewInstallMode": { "type": "downloadBootstrapper" },
    "nsis": {
      "installMode": "currentUser",
      "installerIcon": "icons/icon.ico",
      "languages": ["English", "SpanishInternational"],
      "displayLanguageSelector": false,
      "compression": "lzma"
    }
  }
}
```
- `installMode: currentUser` → installs to `%LOCALAPPDATA%\Programs\ProductivityOS`, no admin/UAC, creates Start-menu shortcut. Matches single-user personal use.
- `webviewInstallMode: downloadBootstrapper` → smallest installer; fetches WebView2 only if absent.
- Icons: provide `icon.ico` (multi-size) for the installer + tray; `32/128/256 png` for the app + tray. Tauri's `tauri icon path/to/logo.png` generates the full icon set.
- Build: `npm run tauri build` → outputs `src-tauri/target/release/bundle/nsis/ProductivityOS_0.1.0_x64-setup.exe`.
- Code signing is out of scope for a personal driver; unsigned installer triggers SmartScreen once (acceptable for own use). Note it so it's a conscious choice.

---

### 9. File layout (feature-based, Rust thin)

```
src-tauri/
  src/{lib.rs, main.rs, tray.rs, floating.rs, commands.rs}
  migrations/0001_init.sql            # drizzle-kit output, applied by plugin
  capabilities/default.json
  tauri.conf.json
  icons/
src/
  data/{db.ts, schema.ts}            # Drizzle schema + proxy client (persistence layer)
  features/timer/floating/…          # floating window React UI (#/floating route)
  features/tray/trayBridge.ts        # listens tray://* events, calls feature logic
  lib/window.ts                      # opacity, click-through, snap, always-on-top helpers
```

Rust stays thin (window lifecycle, tray, plugin wiring, 4 commands); all business logic lives in TS feature modules, satisfying the "no business logic in Rust/components, separate layers" principle.

## Code Sketches

See the `content` field — every code block there (Cargo.toml, tauri.conf.json, capabilities/default.json, floating.rs, tray.rs, commands.rs, lib.rs, db.ts sqlite-proxy wiring, migration registration, NSIS bundle config, and the frontend helper snippets for drag/snap/opacity/notifications/autostart) is a concrete, implementation-ready sketch. The three load-bearing ones a reviewer should not miss:

1. Floating window builder with the anti-black-flash guard (`.visible(false)` + `timer_window_ready` show-after-paint) in `src-tauri/src/floating.rs`.

2. The Drizzle sqlite-proxy <-> tauri-plugin-sql bridge in `src/data/db.ts`, specifically the `Object.values(row)` mapping that converts the plugin's row-OBJECTS into the array-of-VALUES shape the proxy driver requires, plus `run` vs `select` method routing.

3. Hide-to-tray via `on_window_event` CloseRequested `api.prevent_close(); window.hide()` in `src-tauri/src/lib.rs`, combined with single-instance-first plugin registration and `--minimized` autostart handling.

## Risks

- Native window opacity API in Tauri 2 is not stable across versions; the design deliberately uses CSS surface-alpha instead. If a whole-window (compositor-level) fade is later required, a targeted native set_opacity/HWND SetLayeredWindowAttributes path must be added and tested per Tauri version.
- Object.values(row) ordering assumption in the sqlite-proxy bridge: relies on the SQL plugin preserving column order matching the SELECT. Safe for explicit column lists and SELECT *, but a driver update could break it — mitigation is to prefer explicit column lists in Drizzle queries and add an integration test that round-trips a multi-column row.
- Click-through (set_ignore_cursor_events(true)) makes the window unable to receive any mouse events, so it cannot un-toggle itself; must be re-enabled from tray or a global shortcut. Per-region hit-testing is not reliably available in WebView2, so a true 'interactive grip while ghosted' UX is not achievable in MVP.
- Transparent borderless window loses native Win11 rounded corners + DWM shadow; corners must be faked with CSS border-radius and shadow omitted — minor visual compromise.
- Autostart --minimized relies on arg passing through the launcher; on some Windows configs the autostart entry may need the flag verified after enable(). Test the boot-hidden path on the actual target machine.
- downloadBootstrapper WebView2 mode requires network on first install if the runtime is absent; on an offline machine without WebView2 the install would stall. Win11 ships WebView2 so low risk, but note fixedVersion/embedBootstrapper as fallbacks if targeting an offline install.
- Unsigned NSIS installer will trip SmartScreen; acceptable for personal use but explicitly a non-distribution choice.

## Open Questions

- Confirm the exact Tauri 2 minor version to pin — a few window/permission API identifiers (e.g. set_opacity availability, permission string names) shifted across 2.0->2.x point releases; pinning avoids capability-file drift.
- Is a global shortcut plugin (tauri-plugin-global-shortcut) in scope for click-through toggle and start/pause hotkeys, or should those stay tray-only for MVP? The tray menu already carries accelerators but OS-global hotkeys need the plugin.
- Should the floating timer auto-open on app launch (persisted 'was open' flag) or only via tray/dashboard action? Affects whether open_floating_timer runs in setup().
- Preferred DB file name/location confirmed as sqlite:productivityos.db under the app identifier's APPDATA dir — confirm no requirement to co-locate with a user-visible path or support manual backup/export in this slice.

