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

fn platform_label(platform: Platform) -> &'static str {
    match platform {
        Platform::Macos => "macOS",
        Platform::Windows => "Windows",
        Platform::Other => "Operating system",
    }
}

fn exists_any(paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| path.is_file() || path.is_dir())
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

fn executable_on_path(names: &[&str]) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths).any(|directory| {
                names
                    .iter()
                    .map(|name| directory.join(name))
                    .any(|path| path.is_file())
            })
        })
        .unwrap_or(false)
}

fn app_candidates(
    platform: Platform,
    home: Option<&Path>,
    local_app_data: Option<&Path>,
    program_files: Option<&Path>,
    program_files_x86: Option<&Path>,
) -> (Vec<PathBuf>, Vec<PathBuf>, Vec<PathBuf>) {
    let mut codex_apps = Vec::new();
    let mut claude_apps = Vec::new();
    let mut claude_data = Vec::new();
    match platform {
        Platform::Macos => {
            codex_apps.extend([
                PathBuf::from("/Applications/Codex.app"),
                PathBuf::from("/Applications/ChatGPT.app"),
                PathBuf::from("/Applications/ChatGPT Classic.app"),
            ]);
            claude_apps.extend([
                PathBuf::from("/Applications/Claude.app"),
                PathBuf::from("/Applications/Claude Code.app"),
            ]);
            if let Some(home) = home {
                claude_data.push(home.join("Library/Application Support/Claude/claude-code"));
                claude_data.push(home.join(".claude"));
            }
        }
        Platform::Windows => {
            for root in [local_app_data, program_files, program_files_x86]
                .into_iter()
                .flatten()
            {
                codex_apps.extend([
                    root.join("Programs/Codex/Codex.exe"),
                    root.join("Programs/ChatGPT/ChatGPT.exe"),
                    root.join("OpenAI/ChatGPT/ChatGPT.exe"),
                    root.join("Codex/Codex.exe"),
                ]);
                claude_apps.extend([
                    root.join("Programs/Claude/Claude.exe"),
                    root.join("AnthropicClaude/Claude.exe"),
                    root.join("Claude/Claude.exe"),
                ]);
            }
            if let Some(home) = home {
                claude_data.push(home.join(".claude"));
            }
            if let Some(local_app_data) = local_app_data {
                claude_data.push(local_app_data.join("Claude"));
            }
        }
        Platform::Other => {
            if let Some(home) = home {
                claude_data.push(home.join(".claude"));
            }
        }
    }
    (codex_apps, claude_apps, claude_data)
}

pub fn environment_status(app: Option<&AppHandle>) -> EnvironmentStatus {
    let platform = current_platform();
    let user_home = home();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = std::env::var_os("PROGRAMFILES").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("PROGRAMFILES(X86)").map(PathBuf::from);
    let (codex_apps, claude_apps, claude_data) = app_candidates(
        platform,
        user_home.as_deref(),
        local_app_data.as_deref(),
        program_files.as_deref(),
        program_files_x86.as_deref(),
    );
    let claude_cookie = app
        .and_then(|handle| claude_auth::cookie_header(handle).ok().flatten())
        .is_some();
    let codex_executables: &[&str] = if platform == Platform::Windows {
        &["codex.exe", "ChatGPT.exe"]
    } else {
        &["codex"]
    };
    let claude_executables: &[&str] = if platform == Platform::Windows {
        &["claude.exe", "Claude.exe"]
    } else {
        &["claude"]
    };
    EnvironmentStatus {
        codex_installed: exists_any(&codex_apps) || executable_on_path(codex_executables),
        codex_credentials_found: codex_auth_path().is_some_and(|path| path.is_file()),
        claude_installed: exists_any(&claude_apps) || executable_on_path(claude_executables),
        claude_credentials_found: claude_cookie || exists_any(&claude_data),
    }
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    Command::new(program)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn system_version(platform: Platform) -> String {
    match platform {
        Platform::Macos => command_output("/usr/bin/sw_vers", &["-productVersion"]),
        Platform::Windows => command_output("cmd", &["/C", "ver"]),
        Platform::Other => None,
    }
    .unwrap_or_else(|| "unknown".into())
}

fn clipboard_command(platform: Platform) -> Option<(&'static str, &'static [&'static str])> {
    match platform {
        Platform::Macos => Some(("/usr/bin/pbcopy", &[])),
        Platform::Windows => Some(("cmd", &["/C", "clip"])),
        Platform::Other => None,
    }
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
    let platform = current_platform();
    let mut items = vec![
        DiagnosticItem {
            label: platform_label(platform).into(),
            value: system_version(platform),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_candidates_are_platform_specific() {
        let home = Path::new("/Users/test");
        let (codex, claude, data) = app_candidates(Platform::Macos, Some(home), None, None, None);
        assert!(codex.contains(&PathBuf::from("/Applications/Codex.app")));
        assert!(claude.contains(&PathBuf::from("/Applications/Claude.app")));
        assert!(data.contains(&home.join("Library/Application Support/Claude/claude-code")));
        assert_eq!(
            clipboard_command(Platform::Macos),
            Some(("/usr/bin/pbcopy", &[][..]))
        );
    }

    #[test]
    fn windows_candidates_are_platform_specific() {
        let home = Path::new(r"C:\Users\test");
        let local = Path::new(r"C:\Users\test\AppData\Local");
        let programs = Path::new(r"C:\Program Files");
        let (codex, claude, data) = app_candidates(
            Platform::Windows,
            Some(home),
            Some(local),
            Some(programs),
            None,
        );
        assert!(codex.contains(&local.join("Programs/ChatGPT/ChatGPT.exe")));
        assert!(claude.contains(&programs.join("Claude/Claude.exe")));
        assert!(data.contains(&home.join(".claude")));
        assert_eq!(
            clipboard_command(Platform::Windows),
            Some(("cmd", &["/C", "clip"][..]))
        );
        assert_eq!(platform_label(Platform::Windows), "Windows");
    }

    #[test]
    fn unsupported_platform_fails_closed_for_clipboard() {
        assert_eq!(clipboard_command(Platform::Other), None);
    }
}
