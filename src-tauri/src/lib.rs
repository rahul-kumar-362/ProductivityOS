mod commands;
mod floating;
mod tray;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Schema migrations, embedded from drizzle-kit output. Applied once at startup
/// by tauri-plugin-sql (idempotent, versioned). Append new entries — never edit
/// an applied one.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/0000_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "timer_engine",
            sql: include_str!("../migrations/0001_timer_engine.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "task_timer",
            sql: include_str!("../migrations/0002_task_timer.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Hardening for a tray app that hides its windows: the main window is hidden on
    // autostart and hidden-not-closed to tray, so it spends much of its life occluded.
    // Chromium (WebView2) throttles/backgrounds occluded windows, which can starve the
    // hidden window's JS timers. These flags keep it responsive. (This is NOT the fix
    // for the historic open-timer freeze — that was a webview-build deadlock; see
    // floating.rs.) We append (never clobber) so an external arg like
    // --remote-debugging-port survives.
    #[cfg(desktop)]
    unsafe {
        const OCCLUSION_FLAGS: &str = "--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion";
        let combined = match std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
            Ok(existing) if !existing.trim().is_empty() => format!("{existing} {OCCLUSION_FLAGS}"),
            _ => OCCLUSION_FLAGS.to_string(),
        };
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", combined);
    }

    let mut builder = tauri::Builder::default();

    // Single-instance MUST be registered first (desktop only): a second launch
    // focuses the running window instead of opening a duplicate.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        // Restore window geometry (position/size/etc.) but NOT visibility. The float
        // is transparent and must stay hidden until first paint (revealed via
        // timer_window_ready) to avoid a WebView2 black-flash — restoring a saved
        // visible:true would defeat that. Excluding VISIBLE also means the main window
        // always launches visible (we hide it explicitly on --minimized autostart).
        // Unlike skip_initial_state, this still re-applies the float's last position/size.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags({
                    let mut flags = tauri_plugin_window_state::StateFlags::all();
                    flags.remove(tauri_plugin_window_state::StateFlags::VISIBLE);
                    flags
                })
                .build(),
        )
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:productivityos.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::open_timer,
            commands::close_timer,
            commands::timer_window_ready,
            commands::set_click_through,
            commands::set_float_always_on_top,
        ])
        .setup(|app| {
            tray::build_tray(app.handle())?;

            // Autostart launches with --minimized: keep the main window hidden to tray.
            let minimized = std::env::args().any(|a| a == "--minimized");
            if let Some(main) = app.get_webview_window("main") {
                if minimized {
                    let _ = main.hide();
                }
            }

            // The floating timer is declared statically in tauri.conf.json (visible:false)
            // and reveals itself after first paint via `timer_window_ready`. We must NOT
            // build it here — a runtime WebviewWindowBuilder::build() deadlocks the event
            // loop on Windows (see floating.rs). Nothing to do at startup.
            Ok(())
        })
        // Intercept main-window close -> hide to tray (keeps the engine alive).
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
