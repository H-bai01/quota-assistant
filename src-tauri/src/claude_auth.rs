use tauri::{AppHandle, WebviewWindow};

use crate::subscription::{external_window, navigate_login_window, LoginProvider};

pub(crate) const WINDOW_LABEL: &str = "claude-auth";
const CLAUDE_ROOT: &str = "https://claude.ai/";
const CLAUDE_LOGIN: &str = "https://claude.ai/login";

pub fn ensure_auth_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    external_window(
        app,
        WINDOW_LABEL,
        "额度助手 · Claude 登录",
        "about:blank",
        false,
        LoginProvider::Claude,
    )
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
    navigate_login_window(&window, WINDOW_LABEL, LoginProvider::Claude, CLAUDE_LOGIN)
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
    navigate_login_window(&window, WINDOW_LABEL, LoginProvider::Claude, "about:blank")
        .map_err(|_| "Claude blank URL is invalid".to_string())?;
    let _ = window.hide();
    Ok(())
}
