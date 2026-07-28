use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};

use chrono::{Datelike, Local, NaiveDate};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION},
    redirect::Policy,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

use crate::{claude_auth, codex, models::SubscriptionSnapshot, AppState};

const APPLE_ACCOUNT_URL: &str = "https://account.apple.com/account/manage/section/subscriptions";
const APPLE_READER_URL: &str = "https://apps.apple.com/includes/commerce/subscriptions?wid=d&env=idms_prod_account&theme=light&locale=zh_CN&iso3Code=USA";
const CHATGPT_ACCOUNT_CHECK_URL: &str =
    "https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27";
const CHATGPT_LOGIN_URL: &str = "https://chatgpt.com/auth/login";
const GOOGLE_SUBSCRIPTIONS_URL: &str = "https://play.google.com/store/account/subscriptions";
const READER_TIMEOUT: Duration = Duration::from_secs(12);
const OFFICIAL_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_OFFICIAL_RESPONSE_BYTES: usize = 1024 * 1024;
const APPLE_MESSAGE_SCHEME: &str = "quota-assistant-apple";
const APPLE_WINDOW_LABEL: &str = "subscription-reader-apple";
const CACHE_SCHEMA_VERSION: u8 = 1;
const MAX_CACHE_BYTES: u64 = 256 * 1024;

const APPLE_READER_SCRIPT: &str = r#"(() => {
  if (window.top !== window || location.origin !== 'https://apps.apple.com' || location.port !== '' || location.pathname !== '/includes/commerce/subscriptions') return;
  let sent = false;
  const safeText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\r\n\u0000-\u001f\u007f]/.test(value);
  const containsSensitivePrompt = (value) => /e-?mail|password|passcode|verification|verify|验证码|密码|邮箱|电子邮件/i.test(value);
  const validPlan = (value, service) => safeText(value) && !containsSensitivePrompt(value) && (service === 'ChatGPT' ? /^(ChatGPT|Codex)(?:\s|$)/i.test(value) : /^Claude(?:\s|$)/i.test(value));
  const validRenewal = (value) => safeText(value) && !containsSensitivePrompt(value) && /续期|续订|renew/i.test(value) && (/\d{1,2}\s*月\s*\d{1,2}\s*日/.test(value) || /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}/i.test(value));
  const extract = (lines, service) => {
    const start = lines.indexOf(service);
    if (start < 0) return null;
    const plan = lines[start + 1] || '';
    const renewal = lines.slice(start + 1, start + 9).find(validRenewal) || '';
    if (!validRenewal(renewal)) return null;
    return { plan: validPlan(plan, service) ? plan : null, renewal_label: renewal };
  };
  const send = () => {
    if (sent || !document.body) return;
    const lines = document.body.innerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const payload = { version: 1, codex: extract(lines, 'ChatGPT'), claude: extract(lines, 'Claude') };
    if (!payload.codex && !payload.claude) return;
    sent = true;
    location.href = 'quota-assistant-apple://result?payload=' + encodeURIComponent(JSON.stringify(payload));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', send, { once: true });
  else send();
  new MutationObserver(send).observe(document.documentElement, { childList: true, subtree: true });
})()"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BillingSource {
    Apple,
    Google,
    Web,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LoginProvider {
    Apple,
    ChatGpt,
    Claude,
    Google,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct LoginNavigationState {
    provider: LoginProvider,
    requested_url: Url,
    finished_url: Option<Url>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LoginPageFinish {
    Recorded,
    Stale,
    Invalid,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct AppleSubscriptionRecord {
    plan: Option<String>,
    renewal_label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct AppleSubscriptionPayload {
    version: u8,
    codex: Option<AppleSubscriptionRecord>,
    claude: Option<AppleSubscriptionRecord>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionLoginEnded {
    provider: String,
    outcome: &'static str,
}

static APPLE_MESSAGE: OnceLock<Arc<Mutex<Option<AppleSubscriptionPayload>>>> = OnceLock::new();
static ACTIVE_LOGIN_PROVIDER: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static LOGIN_NAVIGATION_STATES: OnceLock<Mutex<HashMap<String, LoginNavigationState>>> =
    OnceLock::new();
static CACHE_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static CACHE_WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn apple_message_store() -> Arc<Mutex<Option<AppleSubscriptionPayload>>> {
    APPLE_MESSAGE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

fn active_login_provider() -> &'static Mutex<Option<String>> {
    ACTIVE_LOGIN_PROVIDER.get_or_init(|| Mutex::new(None))
}

fn login_navigation_states() -> &'static Mutex<HashMap<String, LoginNavigationState>> {
    LOGIN_NAVIGATION_STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn canonical_login_url(provider: LoginProvider, url: &Url) -> Option<Url> {
    if !login_url_is_allowed(provider, url) || login_url_reports_error(url) {
        return None;
    }
    if is_safe_blank(url) {
        return Some(url.clone());
    }
    let mut canonical = url.clone();
    canonical.set_query(None);
    canonical.set_fragment(None);
    canonical.set_port(None).ok()?;
    Some(canonical)
}

fn register_login_navigation(label: &str, provider: LoginProvider, url: &Url) -> bool {
    let Some(canonical) = canonical_login_url(provider, url) else {
        return false;
    };
    let Ok(mut states) = login_navigation_states().lock() else {
        return false;
    };
    states.insert(
        label.to_string(),
        LoginNavigationState {
            provider,
            requested_url: canonical,
            finished_url: None,
        },
    );
    true
}

fn record_login_navigation(label: &str, provider: LoginProvider, url: &Url) -> bool {
    let Some(canonical) = canonical_login_url(provider, url) else {
        return false;
    };
    let Ok(mut states) = login_navigation_states().lock() else {
        return false;
    };
    let Some(state) = states.get_mut(label) else {
        return false;
    };
    if state.provider != provider {
        return false;
    }
    state.requested_url = canonical;
    state.finished_url = None;
    true
}

fn record_login_page_finished(label: &str, provider: LoginProvider, url: &Url) -> LoginPageFinish {
    let Some(canonical) = canonical_login_url(provider, url) else {
        return LoginPageFinish::Invalid;
    };
    let Ok(mut states) = login_navigation_states().lock() else {
        return LoginPageFinish::Invalid;
    };
    let Some(state) = states.get_mut(label) else {
        return LoginPageFinish::Invalid;
    };
    if state.provider != provider {
        return LoginPageFinish::Invalid;
    }
    if state.requested_url != canonical {
        return LoginPageFinish::Stale;
    }
    state.finished_url = Some(canonical);
    LoginPageFinish::Recorded
}

fn login_navigation_state(label: &str, provider: LoginProvider) -> Option<LoginNavigationState> {
    login_navigation_states()
        .lock()
        .ok()
        .and_then(|states| states.get(label).cloned())
        .filter(|state| {
            state.provider == provider
                && canonical_login_url(provider, &state.requested_url)
                    .is_some_and(|url| url == state.requested_url)
                && state.finished_url.as_ref().is_none_or(|url| {
                    canonical_login_url(provider, url).is_some_and(|canonical| canonical == *url)
                })
        })
}

fn forget_login_navigation(label: &str) {
    if let Ok(mut states) = login_navigation_states().lock() {
        states.remove(label);
    }
}

fn destroy_login_window(app: &AppHandle, label: &str) {
    forget_login_navigation(label);
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
    }
}

fn begin_login(provider: &str) {
    if let Ok(mut active) = active_login_provider().lock() {
        *active = Some(provider.to_string());
    }
}

fn is_supported_provider(provider: &str) -> bool {
    matches!(provider, "codex" | "claude")
}

pub(crate) fn finish_login(app: &AppHandle, outcome: &'static str) {
    let provider = active_login_provider()
        .lock()
        .ok()
        .and_then(|mut active| active.take());
    if let Some(provider) = provider {
        let _ = app.emit_to(
            "widget",
            "subscription-login-ended",
            SubscriptionLoginEnded { provider, outcome },
        );
    }
}

fn finish_ready_login(app: &AppHandle, values: &[SubscriptionSnapshot]) {
    let active = active_login_provider()
        .lock()
        .ok()
        .and_then(|active| active.clone());
    let Some(provider) = active else {
        return;
    };
    if !values
        .iter()
        .any(|item| item.provider == provider && item.status == "ready")
    {
        return;
    }
    finish_login(app, "success");
    for label in [
        "subscription-reader-apple",
        "subscription-login-google",
        "subscription-login-chatgpt",
        "claude-auth",
    ] {
        destroy_login_window(app, label);
    }
}

fn is_safe_blank(url: &Url) -> bool {
    url.as_str() == "about:blank"
}

fn allowed_origins(provider: LoginProvider) -> &'static [&'static str] {
    match provider {
        LoginProvider::Apple => &[
            "account.apple.com",
            "apps.apple.com",
            "idmsa.apple.com",
            "appleid.apple.com",
        ],
        LoginProvider::ChatGpt => &[
            "chatgpt.com",
            "auth.openai.com",
            "auth0.openai.com",
            "accounts.google.com",
            "idmsa.apple.com",
            "appleid.apple.com",
        ],
        LoginProvider::Claude => &[
            "claude.ai",
            "auth.anthropic.com",
            "accounts.google.com",
            "idmsa.apple.com",
            "appleid.apple.com",
        ],
        LoginProvider::Google => &["play.google.com", "accounts.google.com"],
    }
}

pub(crate) fn login_url_is_allowed(provider: LoginProvider, url: &Url) -> bool {
    if is_safe_blank(url) {
        return true;
    }
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.split('.').any(|label| label.starts_with("xn--")) {
        return false;
    }
    allowed_origins(provider).contains(&host)
}

pub(crate) fn login_url_reports_error(url: &Url) -> bool {
    url.query_pairs()
        .any(|(key, _)| matches!(key.as_ref(), "error" | "error_code" | "error_description"))
}

fn valid_apple_field(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.chars().any(char::is_control)
        && !value.contains('@')
}

fn contains_sensitive_prompt(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "email",
        "e-mail",
        "password",
        "passcode",
        "verification",
        "verify",
        "验证码",
        "密码",
        "邮箱",
        "电子邮件",
    ]
    .iter()
    .any(|term| lower.contains(term))
}

fn valid_apple_plan(value: &str, provider: &str) -> bool {
    if !valid_apple_field(value) || contains_sensitive_prompt(value) {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    let has_prefix = |prefix: &str| {
        lower.strip_prefix(prefix).is_some_and(|rest| {
            rest.is_empty() || rest.chars().next().is_some_and(char::is_whitespace)
        })
    };
    match provider {
        "codex" => ["chatgpt", "codex"].iter().any(|prefix| has_prefix(prefix)),
        "claude" => has_prefix("claude"),
        _ => false,
    }
}

fn valid_apple_renewal_label(value: &str) -> bool {
    valid_apple_field(value)
        && !contains_sensitive_prompt(value)
        && (value.contains("续期")
            || value.contains("续订")
            || value.to_ascii_lowercase().contains("renew"))
        && extract_renewal_date(value).is_some()
}

fn valid_apple_record(record: &AppleSubscriptionRecord, provider: &str) -> bool {
    valid_apple_renewal_label(&record.renewal_label)
        && record
            .plan
            .as_deref()
            .is_none_or(|plan| valid_apple_plan(plan, provider))
}

fn parse_apple_message(url: &Url) -> Option<AppleSubscriptionPayload> {
    if url.scheme() != APPLE_MESSAGE_SCHEME
        || url.host_str() != Some("result")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return None;
    }
    let mut payload = None;
    for (key, value) in url.query_pairs() {
        if key != "payload" || payload.is_some() || value.len() > 1024 {
            return None;
        }
        payload = serde_json::from_str::<AppleSubscriptionPayload>(&value).ok();
    }
    let payload = payload?;
    if payload.version != 1
        || (payload.codex.is_none() && payload.claude.is_none())
        || payload
            .codex
            .as_ref()
            .is_some_and(|item| !valid_apple_record(item, "codex"))
        || payload
            .claude
            .as_ref()
            .is_some_and(|item| !valid_apple_record(item, "claude"))
    {
        return None;
    }
    Some(payload)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubscriptionCacheFile {
    schema_version: u8,
    snapshots: Vec<SubscriptionSnapshot>,
}

fn cache_write_lock() -> &'static Mutex<()> {
    CACHE_WRITE_LOCK.get_or_init(|| Mutex::new(()))
}

fn safe_cache_path(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()) == Some("subscriptions.json")
        && path.parent().is_some()
}

fn validate_optional_text(value: Option<&str>, max_len: usize) -> bool {
    value.is_none_or(|text| {
        text.len() <= max_len && !text.chars().any(|character| character.is_control())
    })
}

fn validate_snapshots(values: &[SubscriptionSnapshot]) -> bool {
    if values.len() > 2 {
        return false;
    }
    let mut seen_codex = false;
    let mut seen_claude = false;
    values.iter().all(|value| {
        let provider_valid = match value.provider.as_str() {
            "codex" if !seen_codex => {
                seen_codex = true;
                value.display_name == "CODEX"
            }
            "claude" if !seen_claude => {
                seen_claude = true;
                value.display_name == "CLAUDE"
            }
            _ => false,
        };
        provider_valid
            && matches!(
                value.billing_source.as_str(),
                "apple" | "google" | "web" | "unknown"
            )
            && value
                .cycle
                .as_deref()
                .is_none_or(|cycle| matches!(cycle, "monthly" | "yearly"))
            && matches!(
                value.status.as_str(),
                "loading"
                    | "ready"
                    | "stale"
                    | "needs_service_login"
                    | "needs_billing_login"
                    | "unsupported"
                    | "cache_error"
            )
            && validate_optional_text(value.plan.as_deref(), 128)
            && validate_optional_text(value.renewal_label.as_deref(), 128)
            && validate_optional_text(value.message.as_deref(), 256)
            && value.renews_at.as_deref().is_none_or(|date| {
                date.get(..10)
                    .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                    .is_some()
            })
            && value
                .remaining_days
                .is_none_or(|days| (-36_500..=36_500).contains(&days))
            && chrono::DateTime::parse_from_rfc3339(&value.updated_at).is_ok()
    })
}

fn parse_cache_bytes(bytes: &[u8]) -> Result<Vec<SubscriptionSnapshot>, ()> {
    if let Ok(cache) = serde_json::from_slice::<SubscriptionCacheFile>(bytes) {
        if cache.schema_version == CACHE_SCHEMA_VERSION && validate_snapshots(&cache.snapshots) {
            return Ok(cache.snapshots);
        }
        return Err(());
    }
    let legacy = serde_json::from_slice::<Vec<SubscriptionSnapshot>>(bytes).map_err(|_| ())?;
    validate_snapshots(&legacy).then_some(legacy).ok_or(())
}

fn read_cache_file(path: &Path) -> Result<Option<Vec<SubscriptionSnapshot>>, ()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(()),
    };
    if !metadata.file_type().is_file() || metadata.len() > MAX_CACHE_BYTES {
        return Err(());
    }
    let bytes = fs::read(path).map_err(|_| ())?;
    parse_cache_bytes(&bytes).map(Some)
}

fn cache_failure() -> Vec<SubscriptionSnapshot> {
    ["codex", "claude"]
        .into_iter()
        .map(|provider| {
            SubscriptionSnapshot::failure(
                provider,
                if provider == "codex" {
                    "CODEX"
                } else {
                    "CLAUDE"
                },
                "unknown",
                "cache_error",
                "本地订阅摘要损坏，未使用无效数据；请手动刷新重新确认",
            )
        })
        .collect()
}

pub fn load_cache(path: &Path) -> Vec<SubscriptionSnapshot> {
    if !safe_cache_path(path) {
        return cache_failure();
    }
    let backup = path.with_extension("json.bak");
    match read_cache_file(path) {
        Ok(Some(values)) => values,
        Ok(None) => match read_cache_file(&backup) {
            Ok(Some(values)) => {
                eprintln!("subscription cache recovered from backup after interrupted replacement");
                values
            }
            Ok(None) => Vec::new(),
            Err(()) => cache_failure(),
        },
        Err(()) => match read_cache_file(&backup) {
            Ok(Some(values)) => {
                eprintln!("subscription cache recovered from backup");
                values
            }
            _ => cache_failure(),
        },
    }
}

fn persist_cache(path: &Path, values: &[SubscriptionSnapshot]) -> Result<(), String> {
    if !safe_cache_path(path) || !validate_snapshots(values) {
        return Err("订阅摘要未通过安全校验".to_string());
    }
    let _guard = cache_write_lock()
        .lock()
        .map_err(|_| "订阅信息写入暂时不可用".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建订阅信息目录".to_string())?;
    }
    let backup = path.with_extension("json.bak");
    for candidate in [path, &backup] {
        if let Ok(metadata) = fs::symlink_metadata(candidate) {
            if !metadata.file_type().is_file() {
                return Err("订阅摘要路径不安全".to_string());
            }
        }
    }
    let cache = SubscriptionCacheFile {
        schema_version: CACHE_SCHEMA_VERSION,
        snapshots: values.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&cache).map_err(|_| "无法保存订阅信息".to_string())?;
    if bytes.len() as u64 > MAX_CACHE_BYTES {
        return Err("订阅摘要超过大小限制".to_string());
    }
    let sequence = CACHE_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary = path.with_extension(format!("json.tmp.{}.{}", std::process::id(), sequence));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "无法创建订阅摘要临时文件".to_string())?;
    if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法同步订阅摘要临时文件: {error}"));
    }
    drop(file);

    let primary_exists = path.exists();
    let primary_is_valid = matches!(read_cache_file(path), Ok(Some(_)));
    let mut rotated_previous = false;
    if primary_is_valid {
        if backup.exists() {
            fs::remove_file(&backup).map_err(|_| "无法轮换订阅摘要备份".to_string())?;
        }
        fs::rename(path, &backup).map_err(|_| "无法备份上一份订阅摘要".to_string())?;
        rotated_previous = true;
    } else if primary_exists {
        fs::remove_file(path).map_err(|_| "无法隔离损坏的订阅摘要".to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if rotated_previous {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法原子更新订阅摘要: {error}"));
    }
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| "无法同步订阅摘要目录".to_string())?;
    }
    Ok(())
}

pub(crate) fn external_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    url: &str,
    visible: bool,
    provider: LoginProvider,
) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(label) {
        if login_navigation_state(label, provider).is_some() {
            return Ok(window);
        }
        finish_login(app, "failed");
        destroy_login_window(app, label);
    }
    let parsed = url.parse().map_err(|_| "官方页面地址无效".to_string())?;
    if !register_login_navigation(label, provider, &parsed) {
        return Err("官方页面地址无效".to_string());
    }
    let navigation_app = app.clone();
    let page_load_app = app.clone();
    let new_window_app = app.clone();
    let navigation_label = label.to_string();
    let page_load_label = label.to_string();
    let new_window_label = label.to_string();
    let apple_messages = apple_message_store();
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed.clone()))
        .title(title)
        .inner_size(920.0, 780.0)
        .min_inner_size(720.0, 620.0)
        .resizable(true)
        .visible(visible)
        .on_navigation(move |target| {
            if provider == LoginProvider::Apple && target.scheme() == APPLE_MESSAGE_SCHEME {
                if let Some(payload) = parse_apple_message(target) {
                    if let Ok(mut message) = apple_messages.lock() {
                        *message = Some(payload);
                    }
                } else {
                    finish_login(&navigation_app, "failed");
                    destroy_login_window(&navigation_app, &navigation_label);
                }
                return false;
            }
            let allowed = record_login_navigation(&navigation_label, provider, target);
            if !allowed {
                finish_login(&navigation_app, "failed");
                destroy_login_window(&navigation_app, &navigation_label);
            }
            allowed
        })
        .on_page_load(move |_, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            match record_login_page_finished(&page_load_label, provider, payload.url()) {
                LoginPageFinish::Recorded | LoginPageFinish::Stale => {}
                LoginPageFinish::Invalid => {
                    finish_login(&page_load_app, "failed");
                    destroy_login_window(&page_load_app, &page_load_label);
                }
            }
        })
        .on_new_window(move |_, _| {
            finish_login(&new_window_app, "failed");
            destroy_login_window(&new_window_app, &new_window_label);
            NewWindowResponse::Deny
        });
    if provider == LoginProvider::Apple {
        builder = builder.initialization_script(APPLE_READER_SCRIPT);
    }
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => {
            forget_login_navigation(label);
            return Err("无法打开官方订阅页面".to_string());
        }
    };
    let close_app = app.clone();
    let close_window = window.clone();
    let close_label = label.to_string();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            finish_login(&close_app, "cancelled");
            forget_login_navigation(&close_label);
            let _ = close_window.destroy();
        }
    });
    Ok(window)
}

pub(crate) fn navigate_login_window(
    window: &WebviewWindow,
    label: &str,
    provider: LoginProvider,
    url: &str,
) -> Result<(), String> {
    let parsed = url
        .parse::<Url>()
        .map_err(|_| "官方登录地址无效".to_string())?;
    if !record_login_navigation(label, provider, &parsed) {
        return Err("官方登录地址无效".to_string());
    }
    if window.navigate(parsed).is_err() {
        forget_login_navigation(label);
        let _ = window.destroy();
        return Err("无法打开官方登录页面".to_string());
    }
    Ok(())
}

fn apple_reader(app: &AppHandle) -> Result<WebviewWindow, String> {
    external_window(
        app,
        APPLE_WINDOW_LABEL,
        "额度助手 · Apple 订阅登录",
        APPLE_ACCOUNT_URL,
        false,
        LoginProvider::Apple,
    )
}

fn source_from_text(value: &str) -> BillingSource {
    match value.trim().to_ascii_lowercase().as_str() {
        "apple" | "app_store" | "ios" | "chatgpt_mobile_ios" | "apple_subscription" => {
            BillingSource::Apple
        }
        "google" | "google_play" | "play_store" | "android" => BillingSource::Google,
        "stripe" | "web" | "chatgpt" | "chatgpt_web" => BillingSource::Web,
        _ => BillingSource::Unknown,
    }
}

fn recursive_source(value: &Value) -> BillingSource {
    match value {
        Value::Object(map) => {
            for (key, item) in map {
                let normalized = key.to_ascii_lowercase();
                if matches!(
                    normalized.as_str(),
                    "billingtype"
                        | "billing_type"
                        | "subscription_source"
                        | "subscriptionsource"
                        | "purchase_origin_platform"
                        | "purchaseoriginplatform"
                ) {
                    if let Some(text) = item.as_str() {
                        let source = source_from_text(text);
                        if source != BillingSource::Unknown {
                            return source;
                        }
                    }
                }
                let source = recursive_source(item);
                if source != BillingSource::Unknown {
                    return source;
                }
            }
            BillingSource::Unknown
        }
        Value::Array(items) => items
            .iter()
            .map(recursive_source)
            .find(|source| *source != BillingSource::Unknown)
            .unwrap_or(BillingSource::Unknown),
        _ => BillingSource::Unknown,
    }
}

fn claude_local_source() -> BillingSource {
    let Some(path) = dirs::home_dir().map(|home| home.join(".claude.json")) else {
        return BillingSource::Unknown;
    };
    let Ok(metadata) = fs::metadata(&path) else {
        return BillingSource::Unknown;
    };
    if !metadata.is_file() || metadata.len() > 512 * 1024 {
        return BillingSource::Unknown;
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|value| recursive_source(&value))
        .unwrap_or(BillingSource::Unknown)
}

async fn codex_source() -> BillingSource {
    let Ok(auth) = codex::load_auth() else {
        return BillingSource::Unknown;
    };
    let mut headers = HeaderMap::new();
    let Ok(mut bearer) = HeaderValue::from_str(&format!("Bearer {}", auth.access_token)) else {
        return BillingSource::Unknown;
    };
    bearer.set_sensitive(true);
    headers.insert(AUTHORIZATION, bearer);
    headers.insert("oai-product-sku", HeaderValue::from_static("CODEX"));
    if let Some(account_id) = auth.account_id {
        let Ok(mut account) = HeaderValue::from_str(&account_id) else {
            return BillingSource::Unknown;
        };
        account.set_sensitive(true);
        headers.insert(HeaderName::from_static("chatgpt-account-id"), account);
    }
    let Ok(client) = reqwest::Client::builder()
        .timeout(OFFICIAL_REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .user_agent(concat!("QuotaAssistant/", env!("CARGO_PKG_VERSION")))
        .build()
    else {
        return BillingSource::Unknown;
    };
    let Ok(response) = client
        .get(CHATGPT_ACCOUNT_CHECK_URL)
        .headers(headers)
        .send()
        .await
    else {
        return BillingSource::Unknown;
    };
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length > MAX_OFFICIAL_RESPONSE_BYTES as u64)
    {
        return BillingSource::Unknown;
    }
    let Ok(bytes) = response.bytes().await else {
        return BillingSource::Unknown;
    };
    if bytes.len() > MAX_OFFICIAL_RESPONSE_BYTES {
        return BillingSource::Unknown;
    }
    serde_json::from_slice::<Value>(&bytes)
        .ok()
        .map(|value| recursive_source(&value))
        .unwrap_or(BillingSource::Unknown)
}

fn extract_renewal_date(label: &str) -> Option<NaiveDate> {
    let digits = label
        .chars()
        .map(|character| {
            if character.is_ascii_digit() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>();
    let values = digits
        .split_whitespace()
        .filter_map(|item| item.parse::<u32>().ok())
        .collect::<Vec<_>>();
    if label.contains('月') && values.len() >= 2 {
        let today = Local::now().date_naive();
        let mut year = today.year();
        let candidate = NaiveDate::from_ymd_opt(year, values[0], values[1])?;
        if candidate < today - chrono::Duration::days(180) {
            year += 1;
        }
        return NaiveDate::from_ymd_opt(year, values[0], values[1]);
    }
    let lower = label.to_ascii_lowercase();
    let months = [
        ("january", 1),
        ("jan", 1),
        ("february", 2),
        ("feb", 2),
        ("march", 3),
        ("mar", 3),
        ("april", 4),
        ("apr", 4),
        ("may", 5),
        ("june", 6),
        ("jun", 6),
        ("july", 7),
        ("jul", 7),
        ("august", 8),
        ("aug", 8),
        ("september", 9),
        ("sep", 9),
        ("october", 10),
        ("oct", 10),
        ("november", 11),
        ("nov", 11),
        ("december", 12),
        ("dec", 12),
    ];
    let month = months
        .iter()
        .find(|(name, _)| lower.contains(name))
        .map(|(_, value)| *value)?;
    let day = *values.first()?;
    let today = Local::now().date_naive();
    let mut year = today.year();
    let candidate = NaiveDate::from_ymd_opt(year, month, day)?;
    if candidate < today - chrono::Duration::days(180) {
        year += 1;
    }
    NaiveDate::from_ymd_opt(year, month, day)
}

fn parse_cycle(plan: &str) -> Option<String> {
    let lower = plan.to_ascii_lowercase();
    if lower.contains("monthly") || plan.contains("每月") || plan.contains("月度") {
        Some("monthly".into())
    } else if lower.contains("yearly")
        || lower.contains("annual")
        || plan.contains("每年")
        || plan.contains("年度")
    {
        Some("yearly".into())
    } else {
        None
    }
}

fn parse_apple_item(
    record: &AppleSubscriptionRecord,
    provider: &str,
) -> Option<SubscriptionSnapshot> {
    if !valid_apple_record(record, provider) {
        return None;
    }
    let plan = record.plan.clone();
    let renewal_label = record.renewal_label.clone();
    let date = extract_renewal_date(&renewal_label)?;
    let today = Local::now().date_naive();
    Some(SubscriptionSnapshot {
        provider: provider.into(),
        display_name: if provider == "codex" {
            "CODEX"
        } else {
            "CLAUDE"
        }
        .into(),
        cycle: plan.as_deref().and_then(parse_cycle),
        plan,
        billing_source: "apple".into(),
        renews_at: Some(format!("{}T00:00:00", date.format("%Y-%m-%d"))),
        renewal_label: Some(renewal_label),
        remaining_days: Some((date - today).num_days()),
        status: "ready".into(),
        message: None,
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}

async fn apple_subscriptions(app: &AppHandle) -> Option<AppleSubscriptionPayload> {
    let window = apple_reader(app).ok()?;
    if let Ok(mut message) = apple_message_store().lock() {
        *message = None;
    }
    let started = std::time::Instant::now();
    let mut reader_script_evaluated = false;
    while started.elapsed() < READER_TIMEOUT {
        if app.get_webview_window(APPLE_WINDOW_LABEL).is_none() {
            forget_login_navigation(APPLE_WINDOW_LABEL);
            return None;
        }
        let payload = apple_message_store()
            .lock()
            .ok()
            .and_then(|mut message| message.take());
        if let Some(payload) = payload {
            finish_login(app, "success");
            destroy_login_window(app, APPLE_WINDOW_LABEL);
            return Some(payload);
        }

        let Some(state) = login_navigation_state(APPLE_WINDOW_LABEL, LoginProvider::Apple) else {
            finish_login(app, "failed");
            destroy_login_window(app, APPLE_WINDOW_LABEL);
            return None;
        };
        if let Some(finished) = state.finished_url {
            let on_reader = finished.host_str() == Some("apps.apple.com")
                && finished.path() == "/includes/commerce/subscriptions";
            if on_reader {
                if !reader_script_evaluated {
                    if window.eval(APPLE_READER_SCRIPT).is_err() {
                        finish_login(app, "failed");
                        destroy_login_window(app, APPLE_WINDOW_LABEL);
                        return None;
                    }
                    reader_script_evaluated = true;
                }
            } else if finished.host_str() == Some("account.apple.com") {
                if navigate_login_window(
                    &window,
                    APPLE_WINDOW_LABEL,
                    LoginProvider::Apple,
                    APPLE_READER_URL,
                )
                .is_err()
                {
                    finish_login(app, "failed");
                    destroy_login_window(app, APPLE_WINDOW_LABEL);
                    return None;
                }
                reader_script_evaluated = false;
            } else {
                return None;
            }
        }
        tokio::time::sleep(Duration::from_millis(180)).await;
    }
    let timed_out_on_reader = login_navigation_state(APPLE_WINDOW_LABEL, LoginProvider::Apple)
        .is_some_and(|state| {
            state.requested_url.host_str() == Some("apps.apple.com")
                && state.requested_url.path() == "/includes/commerce/subscriptions"
        });
    if timed_out_on_reader {
        finish_login(app, "failed");
        destroy_login_window(app, APPLE_WINDOW_LABEL);
    }
    None
}

fn source_failure(provider: &str, source: BillingSource) -> SubscriptionSnapshot {
    let display_name = if provider == "codex" {
        "CODEX"
    } else {
        "CLAUDE"
    };
    match source {
        BillingSource::Unknown => SubscriptionSnapshot::failure(
            provider,
            display_name,
            "unknown",
            "needs_service_login",
            "需要登录服务账号以确认订阅来源",
        ),
        BillingSource::Apple => SubscriptionSnapshot::failure(
            provider,
            display_name,
            "apple",
            "needs_billing_login",
            "需要登录 Apple 账户以读取续期日期",
        ),
        BillingSource::Google => SubscriptionSnapshot::failure(
            provider,
            display_name,
            "google",
            "unsupported",
            "Google Play 订阅读取尚未完成实机验证",
        ),
        BillingSource::Web => SubscriptionSnapshot::failure(
            provider,
            display_name,
            "web",
            "unsupported",
            "网页订阅读取尚未完成实机验证",
        ),
    }
}

async fn current_source(provider: &str) -> BillingSource {
    match provider {
        "codex" => codex_source().await,
        "claude" => claude_local_source(),
        _ => BillingSource::Unknown,
    }
}

async fn collect(app: &AppHandle) -> Vec<SubscriptionSnapshot> {
    let mut codex_source = current_source("codex").await;
    let mut claude_source = current_source("claude").await;
    let apple_payload =
        if codex_source == BillingSource::Apple || claude_source == BillingSource::Apple {
            apple_subscriptions(app).await
        } else {
            None
        };
    if let Some(payload) = apple_payload.as_ref() {
        if codex_source == BillingSource::Unknown
            && payload
                .codex
                .as_ref()
                .and_then(|record| parse_apple_item(record, "codex"))
                .is_some()
        {
            codex_source = BillingSource::Apple;
        }
        if claude_source == BillingSource::Unknown
            && payload
                .claude
                .as_ref()
                .and_then(|record| parse_apple_item(record, "claude"))
                .is_some()
        {
            claude_source = BillingSource::Apple;
        }
    }
    let mut values = Vec::with_capacity(2);
    for (provider, source) in [("codex", codex_source), ("claude", claude_source)] {
        let value = if source == BillingSource::Apple {
            apple_payload
                .as_ref()
                .and_then(|payload| {
                    if provider == "codex" {
                        payload.codex.as_ref()
                    } else {
                        payload.claude.as_ref()
                    }
                })
                .and_then(|record| parse_apple_item(record, provider))
                .unwrap_or_else(|| source_failure(provider, source))
        } else {
            source_failure(provider, source)
        };
        values.push(value);
    }
    values
}

fn preserve_previous_on_failure(value: &mut SubscriptionSnapshot, previous: &SubscriptionSnapshot) {
    let source_changed =
        value.billing_source != "unknown" && value.billing_source != previous.billing_source;
    if previous.renews_at.is_some() && !source_changed {
        let failure_message = value.message.clone();
        let checked_at = value.updated_at.clone();
        let detected_source = value.billing_source.clone();
        *value = previous.clone();
        if detected_source != "unknown" {
            value.billing_source = detected_source;
        }
        value.status = "stale".into();
        value.message = failure_message;
        value.updated_at = checked_at;
    }
    if !source_changed {
        value.plan = previous.plan.clone();
        value.cycle = previous.cycle.clone();
        value.renews_at = previous.renews_at.clone();
        value.renewal_label = previous.renewal_label.clone();
        value.remaining_days = previous.renews_at.as_deref().and_then(|date| {
            let date = date.get(..10)?;
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .ok()
                .map(|date| (date - Local::now().date_naive()).num_days())
        });
    }
}

#[tauri::command]
pub async fn get_subscriptions(
    state: State<'_, AppState>,
) -> Result<Vec<SubscriptionSnapshot>, String> {
    Ok(state
        .subscription_cache
        .lock()
        .map_err(|_| "订阅信息暂时不可用".to_string())?
        .clone())
}

#[tauri::command]
pub async fn refresh_subscriptions(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<SubscriptionSnapshot>, String> {
    let _guard = state.subscription_fetch_lock.lock().await;
    let existing = state
        .subscription_cache
        .lock()
        .map_err(|_| "订阅信息暂时不可用".to_string())?
        .clone();
    let mut values = collect(&app).await;
    finish_ready_login(&app, &values);
    {
        for value in &mut values {
            if value.status == "ready" {
                continue;
            }
            if let Some(previous) = existing.iter().find(|item| item.provider == value.provider) {
                preserve_previous_on_failure(value, previous);
            }
        }
    }
    persist_cache(&state.subscription_path, &values)?;
    *state
        .subscription_cache
        .lock()
        .map_err(|_| "订阅信息暂时不可用".to_string())? = values.clone();
    Ok(values)
}

#[tauri::command]
pub async fn open_subscription_login(provider: String, app: AppHandle) -> Result<(), String> {
    if !is_supported_provider(&provider) {
        return Err("不支持的订阅服务".to_string());
    }
    let source = current_source(&provider).await;
    begin_login(&provider);
    let opened = match source {
        BillingSource::Apple => apple_reader(&app).map(|window| {
            (
                window,
                APPLE_WINDOW_LABEL,
                LoginProvider::Apple,
                APPLE_ACCOUNT_URL,
                true,
            )
        }),
        BillingSource::Google => external_window(
            &app,
            "subscription-login-google",
            "额度助手 · Google Play 订阅",
            GOOGLE_SUBSCRIPTIONS_URL,
            false,
            LoginProvider::Google,
        )
        .map(|window| {
            (
                window,
                "subscription-login-google",
                LoginProvider::Google,
                GOOGLE_SUBSCRIPTIONS_URL,
                false,
            )
        }),
        BillingSource::Web if provider == "claude" => {
            claude_auth::ensure_auth_window(&app).map(|window| {
                (
                    window,
                    claude_auth::WINDOW_LABEL,
                    LoginProvider::Claude,
                    "https://claude.ai/settings/billing",
                    false,
                )
            })
        }
        BillingSource::Web => external_window(
            &app,
            "subscription-login-chatgpt",
            "额度助手 · ChatGPT 订阅",
            "https://chatgpt.com/#settings/Subscription",
            false,
            LoginProvider::ChatGpt,
        )
        .map(|window| {
            (
                window,
                "subscription-login-chatgpt",
                LoginProvider::ChatGpt,
                "https://chatgpt.com/#settings/Subscription",
                false,
            )
        }),
        BillingSource::Unknown if provider == "claude" => {
            if let Err(error) = claude_auth::connect_claude(app.clone()).await {
                finish_login(&app, "failed");
                return Err(error);
            }
            return Ok(());
        }
        BillingSource::Unknown => external_window(
            &app,
            "subscription-login-chatgpt",
            "额度助手 · ChatGPT 登录",
            CHATGPT_LOGIN_URL,
            false,
            LoginProvider::ChatGpt,
        )
        .map(|window| {
            (
                window,
                "subscription-login-chatgpt",
                LoginProvider::ChatGpt,
                CHATGPT_LOGIN_URL,
                false,
            )
        }),
    };
    let (window, label, login_provider, url, keep_apple_flow) = match opened {
        Ok(value) => value,
        Err(error) => {
            finish_login(&app, "failed");
            return Err(error);
        }
    };
    let Some(navigation) = login_navigation_state(label, login_provider) else {
        finish_login(&app, "failed");
        destroy_login_window(&app, label);
        return Err("官方登录状态无效".to_string());
    };
    let preserve_current_page = keep_apple_flow
        && !(navigation.requested_url.host_str() == Some("apps.apple.com")
            && navigation.requested_url.path() == "/includes/commerce/subscriptions");
    if !preserve_current_page && navigate_login_window(&window, label, login_provider, url).is_err()
    {
        finish_login(&app, "failed");
        destroy_login_window(&app, label);
        return Err("无法打开官方登录页面".to_string());
    }
    if window.show().is_err() || window.set_focus().is_err() {
        finish_login(&app, "failed");
        destroy_login_window(&app, label);
        return Err("无法显示官方登录页面".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_snapshot(provider: &str, source: &str, renewal: Option<&str>) -> SubscriptionSnapshot {
        SubscriptionSnapshot {
            provider: provider.into(),
            display_name: if provider == "codex" {
                "CODEX"
            } else {
                "CLAUDE"
            }
            .into(),
            plan: Some(
                if provider == "codex" {
                    "ChatGPT Pro"
                } else {
                    "Claude Pro"
                }
                .into(),
            ),
            billing_source: source.into(),
            cycle: Some("monthly".into()),
            renews_at: renewal.map(str::to_owned),
            renewal_label: renewal.map(|_| "8月8日续期".into()),
            remaining_days: renewal.map(|_| 10),
            status: "ready".into(),
            message: None,
            updated_at: "2026-07-28T00:00:00Z".into(),
        }
    }

    fn test_cache_path(name: &str) -> PathBuf {
        let sequence = CACHE_WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "quota-assistant-cache-test-{}-{sequence}-{name}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        directory.join("subscriptions.json")
    }

    fn cleanup_cache(path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir_all(parent);
        }
    }

    #[test]
    fn parses_chinese_apple_subscription() {
        let chatgpt = parse_apple_item(
            &AppleSubscriptionRecord {
                plan: Some("ChatGPT Pro 5x".into()),
                renewal_label: "8月8日续期".into(),
            },
            "codex",
        )
        .unwrap();
        let claude = parse_apple_item(
            &AppleSubscriptionRecord {
                plan: Some("Claude Pro - Monthly".into()),
                renewal_label: "8月8日续期".into(),
            },
            "claude",
        )
        .unwrap();
        assert_eq!(chatgpt.plan.as_deref(), Some("ChatGPT Pro 5x"));
        assert_eq!(chatgpt.renewal_label.as_deref(), Some("8月8日续期"));
        assert_eq!(claude.cycle.as_deref(), Some("monthly"));
        assert_eq!(claude.billing_source, "apple");
    }

    #[test]
    fn recognizes_nested_billing_source() {
        let value = serde_json::json!({"account": {"subscription_details": {"purchase_origin_platform": "chatgpt_mobile_ios"}}});
        assert_eq!(recursive_source(&value), BillingSource::Apple);
    }

    #[test]
    fn login_origins_are_exact_and_https_only() {
        let allowed = [
            (LoginProvider::ChatGpt, "https://chatgpt.com/auth/login"),
            (LoginProvider::Claude, "https://claude.ai/login"),
            (
                LoginProvider::Apple,
                "https://account.apple.com/account/manage/section/subscriptions",
            ),
            (
                LoginProvider::Google,
                "https://accounts.google.com/ServiceLogin",
            ),
        ];
        for (provider, value) in allowed {
            assert!(login_url_is_allowed(provider, &Url::parse(value).unwrap()));
        }

        let rejected = [
            "http://chatgpt.com/auth/login",
            "https://chatgpt.com.evil.example/auth/login",
            "https://evilchatgpt.com/auth/login",
            "https://chatgpt.com@evil.example/auth/login",
            "https://user:password@chatgpt.com/auth/login",
            "https://xn--chatgpt-9za.com/auth/login",
            "https://chatgpt.com:444/auth/login",
            "javascript:alert(1)",
            "data:text/html,malicious",
        ];
        for value in rejected {
            assert!(!login_url_is_allowed(
                LoginProvider::ChatGpt,
                &Url::parse(value).unwrap()
            ));
        }

        assert!(!login_url_is_allowed(
            LoginProvider::Claude,
            &Url::parse("https://chatgpt.com/auth/login").unwrap()
        ));
        assert!(!login_url_is_allowed(
            LoginProvider::Apple,
            &Url::parse("https://apps.apple.com.evil.example/subscriptions").unwrap()
        ));
        assert!(!login_url_is_allowed(
            LoginProvider::Google,
            &Url::parse("https://claude.ai/login").unwrap()
        ));
    }

    #[test]
    fn apple_message_contains_only_valid_minimum_fields() {
        let mut url = Url::parse("quota-assistant-apple://result").unwrap();
        let payload = serde_json::json!({
            "version": 1,
            "codex": {"plan": "ChatGPT Pro 5x", "renewal_label": "8月8日续期"},
            "claude": null
        })
        .to_string();
        url.query_pairs_mut().append_pair("payload", &payload);
        let parsed = parse_apple_message(&url).unwrap();
        assert_eq!(parsed.codex.unwrap().renewal_label, "8月8日续期");
        assert!(url.fragment().is_none());
        assert!(!APPLE_READER_SCRIPT.contains("location.hash"));
        assert!(!APPLE_READER_SCRIPT.contains("authorization"));
        assert!(!APPLE_READER_SCRIPT.contains("cookie"));
    }

    #[test]
    fn apple_message_rejects_personal_or_extra_data() {
        for payload in [
            serde_json::json!({"version": 1, "codex": {"plan": "person@example.com", "renewal_label": "8月8日续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "ChatGPT Pro", "renewal_label": "8月8日续期", "email": "person@example.com"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "Password", "renewal_label": "8月8日续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "ChatGPT Password", "renewal_label": "8月8日续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "ChatGPT Pro", "renewal_label": "验证码 8月8日续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "ChatGPT Pro", "renewal_label": "即将续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": {"plan": "Claude Max", "renewal_label": "8月8日续期"}, "claude": null}),
            serde_json::json!({"version": 1, "codex": null, "claude": {"plan": "ChatGPT Pro", "renewal_label": "8月8日续期"}}),
            serde_json::json!({"version": 1, "codex": null, "claude": null}),
        ] {
            let mut url = Url::parse("quota-assistant-apple://result").unwrap();
            url.query_pairs_mut()
                .append_pair("payload", &payload.to_string());
            assert!(parse_apple_message(&url).is_none());
        }

        assert!(APPLE_READER_SCRIPT.contains("containsSensitivePrompt"));
        assert!(APPLE_READER_SCRIPT.contains("validPlan(plan, service)"));
        assert!(APPLE_READER_SCRIPT.contains("validRenewal"));
    }

    #[test]
    fn billing_sources_and_provider_ids_are_strict() {
        assert_eq!(source_from_text("apple_subscription"), BillingSource::Apple);
        assert_eq!(source_from_text("not_apple"), BillingSource::Unknown);
        assert_eq!(source_from_text("chatgpt.com.evil"), BillingSource::Unknown);
        assert!(is_supported_provider("codex"));
        assert!(is_supported_provider("claude"));
        assert!(!is_supported_provider("apple"));
        assert!(!is_supported_provider("codex/../claude"));
        assert!(!is_supported_provider(""));
    }

    #[test]
    fn account_check_endpoint_is_fixed_official_https() {
        let url = Url::parse(CHATGPT_ACCOUNT_CHECK_URL).unwrap();
        assert!(login_url_is_allowed(LoginProvider::ChatGpt, &url));
        assert_eq!(url.path(), "/backend-api/accounts/check/v4-2023-04-27");
        assert!(url.query().is_none());
        assert!(url.fragment().is_none());
        assert!(url.username().is_empty());
    }

    #[test]
    fn login_navigation_state_requires_a_finished_allowed_page_and_forgets_secrets() {
        let label = "test-login-navigation-state";
        forget_login_navigation(label);
        let initial = Url::parse("https://chatgpt.com/auth/login").unwrap();
        assert!(register_login_navigation(
            label,
            LoginProvider::ChatGpt,
            &initial
        ));
        assert!(login_navigation_state(label, LoginProvider::ChatGpt)
            .unwrap()
            .finished_url
            .is_none());

        let callback = Url::parse(
            "https://auth.openai.com/callback?code=secret-code&state=person@example.com#private",
        )
        .unwrap();
        assert!(record_login_navigation(
            label,
            LoginProvider::ChatGpt,
            &callback
        ));
        let requested = login_navigation_state(label, LoginProvider::ChatGpt)
            .unwrap()
            .requested_url;
        assert_eq!(requested.as_str(), "https://auth.openai.com/callback");
        assert!(requested.query().is_none());
        assert!(requested.fragment().is_none());
        assert!(!requested.as_str().contains("secret-code"));
        assert!(!requested.as_str().contains('@'));

        assert_eq!(
            record_login_page_finished(label, LoginProvider::ChatGpt, &initial),
            LoginPageFinish::Stale
        );
        assert_eq!(
            record_login_page_finished(label, LoginProvider::ChatGpt, &callback),
            LoginPageFinish::Recorded
        );
        assert_eq!(
            login_navigation_state(label, LoginProvider::ChatGpt)
                .unwrap()
                .finished_url,
            Some(requested)
        );
        assert!(!record_login_navigation(
            label,
            LoginProvider::Claude,
            &Url::parse("https://claude.ai/login").unwrap()
        ));
        assert!(!record_login_navigation(
            label,
            LoginProvider::ChatGpt,
            &Url::parse("https://chatgpt.com/auth/login?error=denied").unwrap()
        ));
        assert!(!record_login_navigation(
            "unknown-login-window",
            LoginProvider::ChatGpt,
            &initial
        ));
        assert_eq!(
            record_login_page_finished("unknown-login-window", LoginProvider::ChatGpt, &initial),
            LoginPageFinish::Invalid
        );
        forget_login_navigation(label);
        assert!(login_navigation_state(label, LoginProvider::ChatGpt).is_none());
    }

    #[test]
    fn external_login_lifecycle_never_queries_a_webview_window_url() {
        let subscription_source = include_str!("subscription.rs");
        let claude_source = include_str!("claude_auth.rs");
        let forbidden = ["window", ".url", "()"].concat();
        assert!(!subscription_source.contains(&forbidden));
        assert!(!claude_source.contains(&forbidden));
        assert!(subscription_source.contains("PageLoadEvent::Finished"));
        assert!(subscription_source.contains("started.elapsed() < READER_TIMEOUT"));
        assert!(subscription_source.contains("get_webview_window(APPLE_WINDOW_LABEL).is_none()"));
    }

    #[test]
    fn cache_persists_schema_and_recovers_the_last_valid_backup() {
        let path = test_cache_path("backup");
        let first = vec![test_snapshot("codex", "apple", Some("2026-08-08T00:00:00"))];
        let second = vec![test_snapshot("codex", "web", Some("2026-09-08T00:00:00"))];
        persist_cache(&path, &first).unwrap();
        persist_cache(&path, &second).unwrap();
        assert_eq!(load_cache(&path), second);

        fs::remove_file(&path).unwrap();
        assert_eq!(load_cache(&path), first);

        persist_cache(&path, &second).unwrap();
        fs::write(&path, b"{\"schemaVersion\":1,\"snapshots\":[").unwrap();
        assert_eq!(load_cache(&path), first);

        let third = vec![test_snapshot("codex", "apple", Some("2026-10-08T00:00:00"))];
        persist_cache(&path, &third).unwrap();
        fs::write(&path, b"truncated-after-recovery").unwrap();
        assert_eq!(load_cache(&path), first);
        cleanup_cache(&path);
    }

    #[test]
    fn cache_rejects_unknown_schema_provider_duplicates_and_oversized_files() {
        let path = test_cache_path("validation");
        fs::write(&path, br#"{"schemaVersion":2,"snapshots":[]}"#).unwrap();
        assert!(load_cache(&path)
            .iter()
            .all(|item| item.status == "cache_error"));

        let duplicate = vec![
            test_snapshot("codex", "apple", None),
            test_snapshot("codex", "apple", None),
        ];
        assert!(persist_cache(&path, &duplicate).is_err());

        let mut unknown = test_snapshot("codex", "apple", None);
        unknown.provider = "evil".into();
        assert!(persist_cache(&path, &[unknown]).is_err());

        fs::write(&path, vec![b'x'; MAX_CACHE_BYTES as usize + 1]).unwrap();
        assert!(load_cache(&path)
            .iter()
            .all(|item| item.status == "cache_error"));
        cleanup_cache(&path);
    }

    #[test]
    fn cache_ignores_crash_temporary_files_and_serializes_concurrent_writers() {
        let path = test_cache_path("concurrent");
        let initial = vec![test_snapshot("claude", "apple", None)];
        persist_cache(&path, &initial).unwrap();
        fs::write(path.with_extension("json.tmp.crash"), b"truncated").unwrap();
        assert_eq!(load_cache(&path), initial);

        let shared = Arc::new(path.clone());
        let writers = (0..4)
            .map(|index| {
                let path = shared.clone();
                std::thread::spawn(move || {
                    let source = if index % 2 == 0 { "apple" } else { "web" };
                    persist_cache(
                        &path,
                        &[test_snapshot("claude", source, Some("2026-08-08T00:00:00"))],
                    )
                })
            })
            .collect::<Vec<_>>();
        for writer in writers {
            writer.join().unwrap().unwrap();
        }
        let loaded = load_cache(&path);
        assert_eq!(loaded.len(), 1);
        assert!(matches!(loaded[0].billing_source.as_str(), "apple" | "web"));
        cleanup_cache(&path);
    }

    #[test]
    fn source_change_does_not_reuse_an_old_account_renewal() {
        let previous = test_snapshot("codex", "apple", Some("2026-08-08T00:00:00"));
        let mut changed = SubscriptionSnapshot::failure(
            "codex",
            "CODEX",
            "web",
            "unsupported",
            "网页订阅读取尚未完成实机验证",
        );
        preserve_previous_on_failure(&mut changed, &previous);
        assert_eq!(changed.billing_source, "web");
        assert!(changed.renews_at.is_none());

        let mut same_source = SubscriptionSnapshot::failure(
            "codex",
            "CODEX",
            "apple",
            "needs_billing_login",
            "需要重新登录",
        );
        preserve_previous_on_failure(&mut same_source, &previous);
        assert_eq!(same_source.status, "stale");
        assert_eq!(same_source.renews_at, previous.renews_at);
    }

    #[cfg(unix)]
    #[test]
    fn cache_symlink_is_rejected() {
        use std::os::unix::fs::symlink;

        let path = test_cache_path("symlink");
        let target = path.with_file_name("target.json");
        fs::write(&target, b"[]").unwrap();
        symlink(&target, &path).unwrap();
        assert!(load_cache(&path)
            .iter()
            .all(|item| item.status == "cache_error"));
        cleanup_cache(&path);
    }
}
