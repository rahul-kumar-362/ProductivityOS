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
        .plugin(tauri_plugin_window_state::Builder::default().build())
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

            // Open the signature floating timer on launch (hidden until first paint).
            let _ = floating::open_floating_timer(app.handle());
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
