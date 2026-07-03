//! Floating always-on-top timer window.
//!
//! The window is declared STATICALLY in tauri.conf.json (label "floating-timer",
//! visible:false) and created during bootstrap — NOT with WebviewWindowBuilder at
//! runtime. Building a second webview window from a command handler (or racily from
//! the setup hook) deadlocks the Tauri/wry event loop on Windows: the native window
//! is created but build() never returns, wedging ALL IPC. So we only ever show/hide
//! the pre-existing window here — never build() and never close() (close destroys it,
//! which would force a deadlocking rebuild on the next open).
//!
//! It starts hidden and is revealed by the frontend after first paint via the
//! `timer_window_ready` command (avoids the WebView2 black-flash on transparent windows).
use tauri::{AppHandle, Manager};

pub const FLOATING_LABEL: &str = "floating-timer";

/// Show (and focus) the floating timer window. It always exists (static config).
pub fn open_floating_timer(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(FLOATING_LABEL) {
        w.show()?;
        w.set_focus()?;
    }
    Ok(())
}

/// Hide the floating timer window. We hide (never close) so the window — and its
/// loaded webview — survive for the next open without a runtime rebuild.
pub fn close_floating_timer(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(FLOATING_LABEL) {
        w.hide()?;
    }
    Ok(())
}
