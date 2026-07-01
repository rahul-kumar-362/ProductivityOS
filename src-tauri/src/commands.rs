//! Thin Tauri commands. All business logic stays in the TS layer; these only
//! manage window lifecycle/appearance for the floating timer.
use tauri::{AppHandle, Runtime, WebviewWindow};

use crate::floating;

#[tauri::command]
pub fn open_timer(app: AppHandle) -> Result<(), String> {
    floating::open_floating_timer(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_timer(app: AppHandle) -> Result<(), String> {
    floating::close_floating_timer(&app).map_err(|e| e.to_string())
}

/// Called by the floating UI right after first paint so we reveal it flash-free.
#[tauri::command]
pub fn timer_window_ready<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

/// Ghost mode: when enabled, clicks pass through the window. Must be re-enabled
/// from the main window / tray since a click-through window can't un-toggle itself.
#[tauri::command]
pub fn set_click_through<R: Runtime>(window: WebviewWindow<R>, enabled: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_float_always_on_top<R: Runtime>(
    window: WebviewWindow<R>,
    on_top: bool,
) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}
