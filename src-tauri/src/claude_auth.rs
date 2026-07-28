use tauri::{
    webview::NewWindowResponse, AppHandle, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::subscription::{
    finish_login, login_url_is_allowed, login_url_reports_error, LoginProvider,
};

const WINDOW_LABEL: &str = "claude-auth";
const CLAUDE_ROOT: &str = "https://claude.ai/";
const CLAUDE_LOGIN: &str = "https://claude.ai/login";

pub fn ensure_auth_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if window
            .url()
            .ok()
            .is_some_and(|url| login_url_is_allowed(LoginProvider::Claude, &url))
        {
            return Ok(window);
        }
        let _ = window.destroy();
    }

    let navigation_app = app.clone();
    let new_window_app = app.clone();
    let window = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::External(
            "about:blank"
                .parse()
                .map_err(|_| "Claude login URL is invalid".to_string())?,
        ),
    )
    .title("额度助手 · Claude 登录")
    .inner_size(900.0, 760.0)
    .min_inner_size(720.0, 620.0)
    .resizable(true)
    .visible(false)
    .on_navigation(move |url| {
        let allowed = login_url_is_allowed(LoginProvider::Claude, url);
        let reports_error = login_url_reports_error(url);
        if !allowed || reports_error {
            finish_login(&navigation_app, "failed");
            if let Some(window) = navigation_app.get_webview_window(WINDOW_LABEL) {
                let _ = window.destroy();
            }
        }
        allowed && !reports_error
    })
    .on_new_window(move |_, _| {
        finish_login(&new_window_app, "failed");
        if let Some(window) = new_window_app.get_webview_window(WINDOW_LABEL) {
            let _ = window.destroy();
        }
        NewWindowResponse::Deny
    })
    .build()
    .map_err(|_| "Claude login window failed".to_string())?;
    let close_app = app.clone();
    let close_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            finish_login(&close_app, "cancelled");
            let _ = close_window.destroy();
        }
    });
    Ok(window)
}

pub fn cookie_header(app: &AppHandle) -> Result<Option<String>, String> {
    let window = ensure_auth_window(app)?;
    let url = CLAUDE_ROOT
        .parse()
        .map_err(|_| "Claude cookie URL is invalid".to_string())?;
    let cookies = window
        .cookies_for_url(url)
        .map_err(|_| "Unable to read Claude login".to_string())?;
    let value = cookies
        .iter()
        .filter(|cookie| !cookie.name().is_empty() && !cookie.value().is_empty())
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    Ok((!value.is_empty()).then_some(value))
}

#[tauri::command]
pub async fn connect_claude(app: AppHandle) -> Result<(), String> {
    let window = ensure_auth_window(&app)?;
    let url = CLAUDE_LOGIN
        .parse()
        .map_err(|_| "Claude login URL is invalid".to_string())?;
    window
        .navigate(url)
        .map_err(|_| "Failed to open Claude login".to_string())?;
    window
        .show()
        .map_err(|_| "Failed to show Claude login".to_string())?;
    window
        .set_focus()
        .map_err(|_| "Failed to focus Claude login".to_string())
}

#[tauri::command]
pub async fn disconnect_claude(app: AppHandle) -> Result<(), String> {
    let window = ensure_auth_window(&app)?;
    let url = CLAUDE_ROOT
        .parse()
        .map_err(|_| "Claude cookie URL is invalid".to_string())?;
    let cookies = window
        .cookies_for_url(url)
        .map_err(|_| "Unable to read Claude login".to_string())?;
    for cookie in cookies {
        window
            .delete_cookie(cookie)
            .map_err(|_| "Claude disconnect failed".to_string())?;
    }
    let _ = window.navigate(
        "about:blank"
            .parse()
            .map_err(|_| "Claude blank URL is invalid".to_string())?,
    );
    let _ = window.hide();
    Ok(())
}
