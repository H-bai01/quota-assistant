use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::watch;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticTarget {
    pub provider: String,
    pub error_category: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticItem {
    pub label: String,
    pub value: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub version: String,
    pub generated_at: String,
    pub overall_status: String,
    pub items: Vec<DiagnosticItem>,
    pub raw_text: String,
}

#[derive(Default)]
struct DiagnosticSession {
    enabled: bool,
    targets: Vec<DiagnosticTarget>,
    last_report: Option<String>,
}

pub struct DiagnosticsState {
    session: Mutex<DiagnosticSession>,
    cancellation: watch::Sender<u64>,
}

impl Default for DiagnosticsState {
    fn default() -> Self {
        let (cancellation, _) = watch::channel(0);
        Self {
            session: Mutex::new(DiagnosticSession::default()),
            cancellation,
        }
    }
}

impl DiagnosticsState {
    fn enable(&self, targets: Vec<DiagnosticTarget>) -> Result<(), String> {
        self.cancel_current();
        let mut session = self
            .session
            .lock()
            .map_err(|_| "diagnostics state unavailable".to_string())?;
        session.enabled = true;
        session.targets = targets;
        session.last_report = None;
        Ok(())
    }

    fn disable(&self) {
        self.cancel_current();
        if let Ok(mut session) = self.session.lock() {
            *session = DiagnosticSession::default();
        }
    }

    fn cancel_current(&self) {
        self.cancellation.send_modify(|generation| {
            *generation = generation.saturating_add(1);
        });
    }

    fn active_targets(&self) -> Result<Vec<DiagnosticTarget>, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "diagnostics state unavailable".to_string())?;
        if !session.enabled {
            return Err("diagnostics are not enabled".into());
        }
        Ok(session.targets.clone())
    }

    fn store_report(&self, raw_text: String) -> Result<(), String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "diagnostics state unavailable".to_string())?;
        if !session.enabled {
            return Err("diagnostics were stopped".into());
        }
        session.last_report = Some(raw_text);
        Ok(())
    }

    fn report_text(&self) -> Result<String, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "diagnostics state unavailable".to_string())?;
        if !session.enabled {
            return Err("diagnostics are not enabled".into());
        }
        session
            .last_report
            .clone()
            .ok_or_else(|| "diagnostics report is not ready".to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Macos,
    Windows,
    Other,
}

fn current_platform() -> Platform {
    match std::env::consts::OS {
        "macos" => Platform::Macos,
        "windows" => Platform::Windows,
        _ => Platform::Other,
    }
}

fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn validate_targets(targets: Vec<DiagnosticTarget>) -> Result<Vec<DiagnosticTarget>, String> {
    if targets.is_empty() {
        return Err("at least one failed provider is required".into());
    }
    let mut seen = HashSet::new();
    let mut validated = Vec::new();
    for target in targets {
        if !matches!(target.provider.as_str(), "codex" | "claude") {
            return Err("unsupported diagnostics provider".into());
        }
        if !matches!(
            target.error_category.as_str(),
            "signed_out" | "unavailable" | "subscription_unavailable"
        ) {
            return Err("unsupported diagnostics error category".into());
        }
        if seen.insert(target.provider.clone()) {
            validated.push(target);
        }
    }
    Ok(validated)
}

fn provider_candidates(
    platform: Platform,
    provider: &str,
    home: Option<&Path>,
    local_app_data: Option<&Path>,
    program_files: Option<&Path>,
    program_files_x86: Option<&Path>,
) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut applications = Vec::new();
    let mut data_directories = Vec::new();
    match (platform, provider) {
        (Platform::Macos, "codex") => {
            applications.extend([
                PathBuf::from("/Applications/Codex.app"),
                PathBuf::from("/Applications/ChatGPT.app"),
                PathBuf::from("/Applications/ChatGPT Classic.app"),
            ]);
            if let Some(home) = home {
                data_directories.push(home.join(".codex"));
            }
        }
        (Platform::Macos, "claude") => {
            applications.extend([
                PathBuf::from("/Applications/Claude.app"),
                PathBuf::from("/Applications/Claude Code.app"),
            ]);
            if let Some(home) = home {
                data_directories.extend([
                    home.join("Library/Application Support/Claude"),
                    home.join(".claude"),
                ]);
            }
        }
        (Platform::Windows, "codex") => {
            for root in [local_app_data, program_files, program_files_x86]
                .into_iter()
                .flatten()
            {
                applications.extend([
                    root.join("Programs/Codex/Codex.exe"),
                    root.join("Programs/ChatGPT/ChatGPT.exe"),
                    root.join("OpenAI/ChatGPT/ChatGPT.exe"),
                    root.join("Codex/Codex.exe"),
                ]);
            }
            if let Some(home) = home {
                data_directories.push(home.join(".codex"));
            }
        }
        (Platform::Windows, "claude") => {
            for root in [local_app_data, program_files, program_files_x86]
                .into_iter()
                .flatten()
            {
                applications.extend([
                    root.join("Programs/Claude/Claude.exe"),
                    root.join("AnthropicClaude/Claude.exe"),
                    root.join("Claude/Claude.exe"),
                ]);
            }
            if let Some(home) = home {
                data_directories.push(home.join(".claude"));
            }
            if let Some(local_app_data) = local_app_data {
                data_directories.push(local_app_data.join("Claude"));
            }
        }
        (Platform::Other, "codex") => {
            if let Some(home) = home {
                data_directories.push(home.join(".codex"));
            }
        }
        (Platform::Other, "claude") => {
            if let Some(home) = home {
                data_directories.push(home.join(".claude"));
            }
        }
        _ => {}
    }
    (applications, data_directories)
}

fn exists_any(paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| path.is_file() || path.is_dir())
}

fn readable_any(paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| {
        if path.is_dir() {
            fs::read_dir(path).is_ok()
        } else if path.is_file() {
            fs::File::open(path).is_ok()
        } else {
            false
        }
    })
}

fn process_running(platform: Platform, provider: &str) -> bool {
    let names: &[&str] = match provider {
        "codex" => &["Codex", "ChatGPT", "Codex.exe", "ChatGPT.exe"],
        "claude" => &["Claude", "Claude Code", "Claude.exe"],
        _ => return false,
    };
    match platform {
        Platform::Macos => names.iter().any(|name| {
            Command::new("/usr/bin/pgrep")
                .args(["-x", name])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success())
        }),
        Platform::Windows => Command::new("tasklist")
            .args(["/NH"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|output| {
                let output = output.to_ascii_lowercase();
                names
                    .iter()
                    .any(|name| output.contains(&name.to_ascii_lowercase()))
            })
            .unwrap_or(false),
        Platform::Other => false,
    }
}

fn endpoint(provider: &str) -> &'static str {
    match provider {
        "codex" => "https://chatgpt.com/",
        "claude" => "https://claude.ai/",
        _ => "https://invalid.invalid/",
    }
}

async fn endpoint_reachable(
    client: &reqwest::Client,
    provider: &str,
    cancellation: &mut watch::Receiver<u64>,
) -> Result<bool, String> {
    tokio::select! {
        _ = cancellation.changed() => Err("diagnostics were stopped".into()),
        response = client.head(endpoint(provider)).send() => Ok(response.is_ok()),
    }
}

fn item(label: String, available: bool) -> DiagnosticItem {
    DiagnosticItem {
        label,
        value: if available { "yes" } else { "no" }.into(),
        status: if available { "ok" } else { "warning" }.into(),
    }
}

fn error_item(provider: &str, category: &str) -> DiagnosticItem {
    DiagnosticItem {
        label: format!("{provider} fetch error"),
        value: match category {
            "signed_out" => "signed out",
            "subscription_unavailable" => "subscription unavailable",
            _ => "unavailable",
        }
        .into(),
        status: "warning".into(),
    }
}

fn report_text(version: &str, generated_at: &str, items: &[DiagnosticItem]) -> String {
    let mut lines = vec![
        format!("额度助手 {version}"),
        format!("Generated: {generated_at}"),
    ];
    lines.extend(
        items
            .iter()
            .map(|entry| format!("{}: {} [{}]", entry.label, entry.value, entry.status)),
    );
    lines.join("\n")
}

#[tauri::command]
pub fn open_diagnostics(
    targets: Vec<DiagnosticTarget>,
    app: AppHandle,
    state: State<'_, DiagnosticsState>,
) -> Result<(), String> {
    let targets = validate_targets(targets)?;
    let window = app
        .get_webview_window("diagnostics")
        .ok_or_else(|| "diagnostics window missing".to_string())?;
    state.enable(targets)?;
    if window.show().is_err() {
        state.disable();
        return Err("failed to show diagnostics window".into());
    }
    let _ = window.set_focus();
    let _ = app.emit_to("diagnostics", "diagnostics-activated", ());
    Ok(())
}

pub fn deactivate(app: &AppHandle) {
    if let Some(state) = app.try_state::<DiagnosticsState>() {
        state.disable();
    }
    let _ = app.emit_to("diagnostics", "diagnostics-deactivated", ());
}

#[tauri::command]
pub fn close_diagnostics(app: AppHandle) -> Result<(), String> {
    deactivate(&app);
    let window = app
        .get_webview_window("diagnostics")
        .ok_or_else(|| "diagnostics window missing".to_string())?;
    window
        .hide()
        .map_err(|_| "failed to close diagnostics window".to_string())
}

#[tauri::command]
pub async fn get_diagnostics_report(
    app: AppHandle,
    state: State<'_, DiagnosticsState>,
) -> Result<DiagnosticsReport, String> {
    let targets = state.active_targets()?;
    let mut cancellation = state.cancellation.subscribe();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "failed to initialize diagnostics client".to_string())?;
    let platform = current_platform();
    let user_home = home();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = std::env::var_os("PROGRAMFILES").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("PROGRAMFILES(X86)").map(PathBuf::from);
    let mut items = Vec::new();
    for target in &targets {
        let (applications, data_directories) = provider_candidates(
            platform,
            &target.provider,
            user_home.as_deref(),
            local_app_data.as_deref(),
            program_files.as_deref(),
            program_files_x86.as_deref(),
        );
        items.push(error_item(&target.provider, &target.error_category));
        items.push(item(
            format!("{} desktop application", target.provider),
            exists_any(&applications),
        ));
        items.push(item(
            format!("{} desktop process", target.provider),
            process_running(platform, &target.provider),
        ));
        items.push(item(
            format!("{} local data directory readable", target.provider),
            readable_any(&data_directories),
        ));
        items.push(item(
            format!("{} official endpoint reachable", target.provider),
            endpoint_reachable(&client, &target.provider, &mut cancellation).await?,
        ));
    }
    let version = app.package_info().version.to_string();
    let generated_at = chrono::Utc::now().to_rfc3339();
    let overall_status = if items.iter().all(|entry| entry.status == "ok") {
        "ok"
    } else {
        "warning"
    }
    .to_string();
    let raw_text = report_text(&version, &generated_at, &items);
    state.store_report(raw_text.clone())?;
    Ok(DiagnosticsReport {
        version,
        generated_at,
        overall_status,
        items,
        raw_text,
    })
}

fn clipboard_command(platform: Platform) -> Option<(&'static str, &'static [&'static str])> {
    match platform {
        Platform::Macos => Some(("/usr/bin/pbcopy", &[])),
        Platform::Windows => Some(("cmd", &["/C", "clip"])),
        Platform::Other => None,
    }
}

#[tauri::command]
pub fn copy_diagnostics_report(state: State<'_, DiagnosticsState>) -> Result<(), String> {
    let raw_text = state.report_text()?;
    let (program, args) = clipboard_command(current_platform())
        .ok_or_else(|| "Clipboard integration is unavailable on this platform".to_string())?;
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|_| "Unable to open the clipboard helper".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "Clipboard input is unavailable".to_string())?
        .write_all(raw_text.as_bytes())
        .map_err(|_| "Unable to copy the diagnostics report".to_string())?;
    let status = child
        .wait()
        .map_err(|_| "Unable to finish copying the diagnostics report".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Unable to copy the diagnostics report".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(provider: &str, error_category: &str) -> DiagnosticTarget {
        DiagnosticTarget {
            provider: provider.into(),
            error_category: error_category.into(),
        }
    }

    #[test]
    fn validation_accepts_only_known_failed_providers() {
        assert_eq!(
            validate_targets(vec![target("codex", "signed_out")]).unwrap(),
            vec![target("codex", "signed_out")]
        );
        assert!(validate_targets(vec![target("claude", "subscription_unavailable")]).is_ok());
        assert!(validate_targets(vec![target("other", "unavailable")]).is_err());
        assert!(validate_targets(vec![target("claude", "raw_server_error")]).is_err());
        assert!(validate_targets(Vec::new()).is_err());
    }

    #[test]
    fn macos_candidates_are_scoped_without_auth_files() {
        let home = Path::new("/Users/test");
        let (applications, data) =
            provider_candidates(Platform::Macos, "codex", Some(home), None, None, None);
        assert!(applications.contains(&PathBuf::from("/Applications/Codex.app")));
        assert_eq!(data, vec![home.join(".codex")]);
        assert!(applications
            .iter()
            .chain(data.iter())
            .all(|path| !path.to_string_lossy().contains("auth.json")));
    }

    #[test]
    fn windows_candidates_are_platform_specific() {
        let home = Path::new(r"C:\Users\test");
        let local = Path::new(r"C:\Users\test\AppData\Local");
        let programs = Path::new(r"C:\Program Files");
        let (applications, data) = provider_candidates(
            Platform::Windows,
            "claude",
            Some(home),
            Some(local),
            Some(programs),
            None,
        );
        assert!(applications.contains(&programs.join("Claude/Claude.exe")));
        assert!(data.contains(&home.join(".claude")));
        assert_eq!(
            clipboard_command(Platform::Windows),
            Some(("cmd", &["/C", "clip"][..]))
        );
    }

    #[test]
    fn report_contains_only_standardized_non_sensitive_values() {
        let items = vec![
            error_item("claude", "signed_out"),
            item("claude local data directory readable".into(), true),
        ];
        let report = report_text("0.2.3", "2026-07-29T00:00:00Z", &items);
        assert!(report.contains("signed out"));
        for forbidden in ["auth.json", "token", "cookie", "password", "/users/test"] {
            assert!(!report.to_ascii_lowercase().contains(forbidden));
        }
    }

    #[test]
    fn unsupported_platform_fails_closed_for_clipboard() {
        assert_eq!(clipboard_command(Platform::Other), None);
    }
}
