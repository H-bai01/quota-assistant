use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use serde::Serialize;
use tauri::AppHandle;

use crate::claude_auth;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatus {
    pub codex_installed: bool,
    pub codex_credentials_found: bool,
    pub claude_installed: bool,
    pub claude_credentials_found: bool,
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

fn exists_any(paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| path.exists())
}

fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn codex_auth_path() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home().map(|path| path.join(".codex")))
        .map(|path| path.join("auth.json"))
}

fn executable_on_path(name: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths)
                .map(|directory| directory.join(name))
                .any(|path| path.is_file())
        })
        .unwrap_or(false)
}

pub fn environment_status(app: Option<&AppHandle>) -> EnvironmentStatus {
    let claude_support = home()
        .map(|path| path.join("Library/Application Support/Claude/claude-code"))
        .into_iter()
        .collect::<Vec<_>>();
    let claude_cookie = app
        .and_then(|handle| claude_auth::cookie_header(handle).ok().flatten())
        .is_some();
    EnvironmentStatus {
        codex_installed: exists_any(&[
            Path::new("/Applications/Codex.app").into(),
            Path::new("/Applications/ChatGPT.app").into(),
            Path::new("/Applications/ChatGPT Classic.app").into(),
        ]),
        codex_credentials_found: codex_auth_path().is_some_and(|path| path.is_file()),
        claude_installed: exists_any(&[
            Path::new("/Applications/Claude.app").into(),
            Path::new("/Applications/Claude Code.app").into(),
        ]) || executable_on_path("claude"),
        claude_credentials_found: claude_cookie || exists_any(&claude_support),
    }
}

fn macos_version() -> String {
    Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".into())
}

fn item(label: &str, available: bool) -> DiagnosticItem {
    DiagnosticItem {
        label: label.into(),
        value: if available { "yes" } else { "no" }.into(),
        status: if available { "ok" } else { "warning" }.into(),
    }
}

#[tauri::command]
pub fn get_environment_status(app: AppHandle) -> EnvironmentStatus {
    environment_status(Some(&app))
}

#[tauri::command]
pub fn get_diagnostics_report(app: AppHandle) -> DiagnosticsReport {
    let status = environment_status(Some(&app));
    let version = app.package_info().version.to_string();
    let generated_at = chrono::Utc::now().to_rfc3339();
    let mut items = vec![
        DiagnosticItem {
            label: "macOS".into(),
            value: macos_version(),
            status: "info".into(),
        },
        DiagnosticItem {
            label: "Architecture".into(),
            value: std::env::consts::ARCH.into(),
            status: "info".into(),
        },
        item("Codex application", status.codex_installed),
        item("Codex credentials", status.codex_credentials_found),
        item("Claude application", status.claude_installed),
        item("Claude login", status.claude_credentials_found),
    ];
    let overall_status = if status.codex_credentials_found || status.claude_credentials_found {
        "ok"
    } else {
        "warning"
    }
    .to_string();
    let mut lines = vec![
        format!("额度助手 {version}"),
        format!("Generated: {generated_at}"),
    ];
    lines.extend(
        items
            .iter()
            .map(|entry| format!("{}: {} [{}]", entry.label, entry.value, entry.status)),
    );
    DiagnosticsReport {
        version,
        generated_at,
        overall_status,
        items: std::mem::take(&mut items),
        raw_text: lines.join("\n"),
    }
}

#[tauri::command]
pub fn copy_diagnostics_report(app: AppHandle) -> Result<(), String> {
    let report = get_diagnostics_report(app);
    let mut child = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|_| "Unable to open the clipboard helper".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "Clipboard input is unavailable".to_string())?
        .write_all(report.raw_text.as_bytes())
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
