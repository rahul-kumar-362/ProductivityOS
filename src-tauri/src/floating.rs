//! Floating always-on-top timer window: created at runtime (never declared
//! statically) with visible(false) to avoid the WebView2 black-flash on
//! transparent windows — it is revealed by the frontend after first paint via
//! the `timer_window_ready` command.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const FLOATING_LABEL: &str = "floating-timer";

/// Open (or focus, if already open) the floating timer window.
pub fn open_floating_timer(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(FLOATING_LABEL) {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        FLOATING_LABEL,
        WebviewUrl::App("index.html#/float".into()),
    )
    .title("Timer")
    .inner_size(268.0, 108.0)
    .min_inner_size(120.0, 48.0)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .shadow(false)
    .visible(false)
    .build()?;

    Ok(())
}

/// Close the floating timer window if present.
pub fn close_floating_timer(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(FLOATING_LABEL) {
        w.close()?;
    }
    Ok(())
}
