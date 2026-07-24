use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "claude-auth";
const CLAUDE_ROOT: &str = "https://claude.ai/";
const CLAUDE_LOGIN: &str = "https://claude.ai/login";

pub fn ensure_auth_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        return Ok(window);
    }

    WebviewWindowBuilder::new(
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
    .build()
    .map_err(|error| format!("Claude login window failed: {error}"))
}

pub fn cookie_header(app: &AppHandle) -> Result<Option<String>, String> {
    let window = ensure_auth_window(app)?;
    let url = CLAUDE_ROOT
        .parse()
        .map_err(|_| "Claude cookie URL is invalid".to_string())?;
    let cookies = window
        .cookies_for_url(url)
        .map_err(|error| format!("Unable to read Claude login: {error}"))?;
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
        .map_err(|error| format!("Failed to open Claude login: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Failed to show Claude login: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus Claude login: {error}"))
}

#[tauri::command]
pub async fn disconnect_claude(app: AppHandle) -> Result<(), String> {
    let window = ensure_auth_window(&app)?;
    let url = CLAUDE_ROOT
        .parse()
        .map_err(|_| "Claude cookie URL is invalid".to_string())?;
    let cookies = window
        .cookies_for_url(url)
        .map_err(|error| format!("Unable to read Claude login: {error}"))?;
    for cookie in cookies {
        window
            .delete_cookie(cookie)
            .map_err(|error| format!("Claude disconnect failed: {error}"))?;
    }
    let _ = window.navigate(
        "about:blank"
            .parse()
            .map_err(|_| "Claude blank URL is invalid".to_string())?,
    );
    let _ = window.hide();
    Ok(())
}
