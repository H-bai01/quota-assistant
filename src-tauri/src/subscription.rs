use std::{fs, path::PathBuf, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{Datelike, Local, NaiveDate};
use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{claude_auth, codex, models::SubscriptionSnapshot, AppState};

const APPLE_ACCOUNT_URL: &str = "https://account.apple.com/account/manage/section/subscriptions";
const APPLE_READER_URL: &str = "https://apps.apple.com/includes/commerce/subscriptions?wid=d&env=idms_prod_account&theme=light&locale=zh_CN&iso3Code=USA";
const CHATGPT_SESSION_URL: &str = "https://chatgpt.com/api/auth/session";
const CHATGPT_LOGIN_URL: &str = "https://chatgpt.com/auth/login";
const GOOGLE_SUBSCRIPTIONS_URL: &str = "https://play.google.com/store/account/subscriptions";
const READER_TIMEOUT: Duration = Duration::from_secs(12);
const SOURCE_TIMEOUT: Duration = Duration::from_secs(22);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BillingSource {
    Apple,
    Google,
    Web,
    Unknown,
}

pub fn load_cache(path: &PathBuf) -> Vec<SubscriptionSnapshot> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn persist_cache(path: &PathBuf, values: &[SubscriptionSnapshot]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建订阅信息目录".to_string())?;
    }
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(values).map_err(|_| "无法保存订阅信息".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "无法写入订阅信息".to_string())?;
    fs::rename(temporary, path).map_err(|_| "无法更新订阅信息".to_string())
}

fn external_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    url: &str,
    visible: bool,
) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(label) {
        return Ok(window);
    }
    let parsed = url.parse().map_err(|_| "官方页面地址无效".to_string())?;
    WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(920.0, 780.0)
        .min_inner_size(720.0, 620.0)
        .resizable(true)
        .visible(visible)
        .build()
        .map_err(|_| "无法打开官方订阅页面".to_string())
}

fn apple_reader(app: &AppHandle) -> Result<WebviewWindow, String> {
    external_window(
        app,
        "subscription-reader-apple",
        "额度助手 · Apple 订阅登录",
        APPLE_ACCOUNT_URL,
        false,
    )
}

fn chatgpt_reader(app: &AppHandle) -> Result<WebviewWindow, String> {
    external_window(
        app,
        "subscription-reader-chatgpt",
        "额度助手 · 正在确认 ChatGPT 订阅",
        CHATGPT_SESSION_URL,
        false,
    )
}

async fn fragment_payload(
    window: &WebviewWindow,
    prefix: &str,
    timeout: Duration,
) -> Option<String> {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if let Some(payload) = window
            .url()
            .ok()
            .and_then(|url| url.fragment().map(str::to_owned))
            .and_then(|fragment| fragment.strip_prefix(prefix).map(str::to_owned))
        {
            return Some(payload);
        }
        tokio::time::sleep(Duration::from_millis(180)).await;
    }
    None
}

fn source_from_text(value: &str) -> BillingSource {
    let value = value.to_ascii_lowercase();
    if value.contains("apple") || value.contains("app_store") || value.contains("ios") {
        BillingSource::Apple
    } else if value.contains("google") || value.contains("play_store") || value.contains("android")
    {
        BillingSource::Google
    } else if value.contains("stripe") || value.contains("web") || value.contains("chatgpt") {
        BillingSource::Web
    } else {
        BillingSource::Unknown
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

async fn codex_source(app: &AppHandle) -> BillingSource {
    let Ok(auth) = codex::load_auth() else {
        return BillingSource::Unknown;
    };
    let Ok(window) = chatgpt_reader(app) else {
        return BillingSource::Unknown;
    };
    let _ = window.eval("location.hash = 'QA_SOURCE_LOADING'");
    let _ = window.navigate(
        CHATGPT_SESSION_URL
            .parse()
            .expect("static ChatGPT session URL"),
    );
    let ready_started = std::time::Instant::now();
    while ready_started.elapsed() < Duration::from_secs(5) {
        let on_chatgpt = window
            .url()
            .ok()
            .and_then(|url| url.host_str().map(|host| host.ends_with("chatgpt.com")))
            .unwrap_or(false);
        if on_chatgpt {
            let _ = window.eval("location.hash = 'QA_SOURCE_READY'");
            tokio::time::sleep(Duration::from_millis(300)).await;
            if window
                .url()
                .ok()
                .and_then(|url| url.fragment().map(str::to_owned))
                .as_deref()
                == Some("QA_SOURCE_READY")
            {
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let token = serde_json::to_string(&auth.access_token).unwrap_or_else(|_| "\"\"".into());
    let account = serde_json::to_string(&auth.account_id).unwrap_or_else(|_| "null".into());
    let script = format!(
        r#"(() => {{
          location.hash = 'QA_SOURCE_PENDING';
          const findSource = (value) => {{
            if (!value || typeof value !== 'object') return null;
            if (Array.isArray(value)) {{ for (const item of value) {{ const hit = findSource(item); if (hit) return hit; }} return null; }}
            for (const [key, item] of Object.entries(value)) {{
              if (['purchase_origin_platform','purchaseOriginPlatform','subscription_source','subscriptionSource'].includes(key) && typeof item === 'string') return item;
              const hit = findSource(item); if (hit) return hit;
            }}
            return null;
          }};
          (async () => {{
            try {{
              const token = {token};
              const account = {account};
              await fetch('/api/auth/link-session', {{ method: 'POST', headers: {{ 'content-type': 'application/json', 'x-i-am-a-browser': 'true' }}, body: JSON.stringify({{ auth_token: token, expires_in: 3600 }}) }});
              const headers = {{ 'authorization': `Bearer ${{token}}`, 'oai-product-sku': 'CODEX' }};
              if (account) headers['chatgpt-account-id'] = account;
              const response = await fetch('/backend-api/accounts/check/v4-2023-04-27', {{ headers }});
              const data = await response.json();
              location.hash = 'QA_SOURCE:' + (findSource(data) || 'unknown');
            }} catch (_) {{ location.hash = 'QA_SOURCE:unknown'; }}
          }})();
        }})()"#
    );
    if window.eval(script.clone()).is_err() {
        return BillingSource::Unknown;
    }
    let started = std::time::Instant::now();
    let mut last_retry = std::time::Instant::now();
    while started.elapsed() < SOURCE_TIMEOUT {
        if let Some(value) = window
            .url()
            .ok()
            .and_then(|url| url.fragment().map(str::to_owned))
            .and_then(|fragment| fragment.strip_prefix("QA_SOURCE:").map(str::to_owned))
        {
            let source = source_from_text(&value);
            if source != BillingSource::Unknown {
                let _ = window.navigate("about:blank".parse().expect("static blank URL"));
                return source;
            }
            if last_retry.elapsed() >= Duration::from_millis(500) {
                let _ = window.eval(script.clone());
                last_retry = std::time::Instant::now();
            }
        }
        tokio::time::sleep(Duration::from_millis(180)).await;
    }
    let _ = window.navigate("about:blank".parse().expect("static blank URL"));
    BillingSource::Unknown
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

fn parse_apple_item(text: &str, provider: &str) -> Option<SubscriptionSnapshot> {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let service_name = if provider == "codex" {
        "ChatGPT"
    } else {
        "Claude"
    };
    let start = lines.iter().position(|line| *line == service_name)?;
    let plan = lines.get(start + 1).map(|value| (*value).to_string());
    let renewal_label = lines
        .iter()
        .skip(start + 1)
        .take(8)
        .find(|line| {
            let lower = line.to_ascii_lowercase();
            line.contains("续期") || line.contains("续订") || lower.contains("renew")
        })
        .map(|value| (*value).to_string())?;
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

fn apple_account_is_ready(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let signed_in = text.contains("退出登录") || lower.contains("sign out");
    let subscriptions_visible = text.contains("订阅") || lower.contains("subscriptions");
    let login_form_visible = text.contains("电子邮件地址")
        || text.contains("登录 Apple")
        || lower.contains("sign in")
        || lower.contains("email address");
    subscriptions_visible && (signed_in || !login_form_visible)
}

async fn apple_subscriptions(app: &AppHandle) -> Option<String> {
    let window = apple_reader(app).ok()?;
    let mut current_url = window.url().ok();
    let authenticating = current_url.as_ref().is_some_and(|url| {
        (url.host_str() == Some("apps.apple.com") && url.path().contains("/authenticate"))
            || url
                .host_str()
                .is_some_and(|host| host.ends_with("idmsa.apple.com"))
    });
    if authenticating {
        return None;
    }
    let mut on_reader = current_url.as_ref().is_some_and(|url| {
        url.host_str() == Some("apps.apple.com")
            && url.path().contains("/includes/commerce/subscriptions")
    });
    let on_account_page = current_url.as_ref().is_some_and(|url| {
        url.host_str() == Some("account.apple.com") && url.path().contains("/account/manage")
    });
    if on_account_page {
        let _ = window.eval("location.hash = 'QA_ACCOUNT_LOADING'");
        let account_script = r#"(() => {
          try {
            const text = document.body ? document.body.innerText : '';
            const payload = btoa(unescape(encodeURIComponent(text.slice(0, 12000))));
            location.hash = 'QA_ACCOUNT:' + payload;
          } catch (_) { location.hash = 'QA_ACCOUNT:'; }
        })()"#;
        let _ = window.eval(account_script);
        let account_text = fragment_payload(&window, "QA_ACCOUNT:", Duration::from_secs(2))
            .await
            .and_then(|payload| STANDARD.decode(payload).ok())
            .and_then(|bytes| String::from_utf8(bytes).ok())?;
        if !apple_account_is_ready(&account_text) {
            return None;
        }
        let _ = window.navigate(APPLE_READER_URL.parse().ok()?);
        tokio::time::sleep(Duration::from_millis(850)).await;
        current_url = window.url().ok();
        on_reader = current_url.as_ref().is_some_and(|url| {
            url.host_str() == Some("apps.apple.com")
                && url.path().contains("/includes/commerce/subscriptions")
        });
    }
    if !on_reader {
        return None;
    } else {
        tokio::time::sleep(Duration::from_millis(180)).await;
    }
    let _ = window.eval("location.hash = 'QA_APPLE_LOADING'");
    let script = r#"(() => {
      try {
        const text = document.body ? document.body.innerText : '';
        const payload = btoa(unescape(encodeURIComponent(text.slice(0, 12000))));
        location.hash = 'QA_APPLE:' + payload;
      } catch (_) { location.hash = 'QA_APPLE:'; }
    })()"#;
    let started = std::time::Instant::now();
    while started.elapsed() < READER_TIMEOUT {
        let _ = window.eval(script);
        if let Some(payload) =
            fragment_payload(&window, "QA_APPLE:", Duration::from_millis(420)).await
        {
            if let Ok(bytes) = STANDARD.decode(payload) {
                if let Ok(text) = String::from_utf8(bytes) {
                    if text.contains("ChatGPT") || text.contains("Claude") {
                        return Some(text);
                    }
                    let lower = text.to_ascii_lowercase();
                    if text.contains("电子邮件地址继续")
                        || text.contains("登录 Apple")
                        || lower.contains("sign in")
                        || lower.contains("apple account")
                    {
                        return None;
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
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

fn cached_source(values: &[SubscriptionSnapshot], provider: &str) -> BillingSource {
    values
        .iter()
        .find(|item| item.provider == provider)
        .map(|item| source_from_text(&item.billing_source))
        .unwrap_or(BillingSource::Unknown)
}

async fn collect(app: &AppHandle, existing: &[SubscriptionSnapshot]) -> Vec<SubscriptionSnapshot> {
    let codex_hint = cached_source(existing, "codex");
    let mut codex_source = if codex_hint == BillingSource::Unknown {
        codex_source(app).await
    } else {
        codex_hint
    };
    let local_claude_source = claude_local_source();
    let mut claude_source = if local_claude_source == BillingSource::Unknown {
        cached_source(existing, "claude")
    } else {
        local_claude_source
    };
    let apple_text =
        if codex_source == BillingSource::Apple || claude_source == BillingSource::Apple {
            apple_subscriptions(app).await
        } else {
            None
        };
    if let Some(text) = apple_text.as_deref() {
        if codex_source == BillingSource::Unknown && parse_apple_item(text, "codex").is_some() {
            codex_source = BillingSource::Apple;
        }
        if claude_source == BillingSource::Unknown && parse_apple_item(text, "claude").is_some() {
            claude_source = BillingSource::Apple;
        }
    }
    let mut values = Vec::with_capacity(2);
    for (provider, source) in [("codex", codex_source), ("claude", claude_source)] {
        let value = if source == BillingSource::Apple {
            apple_text
                .as_deref()
                .and_then(|text| parse_apple_item(text, provider))
                .unwrap_or_else(|| source_failure(provider, source))
        } else {
            source_failure(provider, source)
        };
        values.push(value);
    }
    if values.iter().any(|item| item.status == "ready") {
        if let Some(window) = app.get_webview_window("subscription-reader-apple") {
            let _ = window.hide();
        }
    }
    values
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
    let mut values = collect(&app, &existing).await;
    {
        for value in &mut values {
            if value.status == "ready" {
                continue;
            }
            if let Some(previous) = existing.iter().find(|item| item.provider == value.provider) {
                if previous.renews_at.is_some() {
                    let failure_message = value.message.clone();
                    let checked_at = value.updated_at.clone();
                    *value = previous.clone();
                    value.status = "stale".into();
                    value.message = failure_message;
                    value.updated_at = checked_at;
                }
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
    }
    persist_cache(&state.subscription_path, &values)?;
    *state
        .subscription_cache
        .lock()
        .map_err(|_| "订阅信息暂时不可用".to_string())? = values.clone();
    Ok(values)
}

#[tauri::command]
pub async fn open_subscription_login(
    provider: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let source = state
        .subscription_cache
        .lock()
        .ok()
        .and_then(|values| {
            values
                .iter()
                .find(|item| item.provider == provider)
                .cloned()
        })
        .map(|item| source_from_text(&item.billing_source))
        .unwrap_or(BillingSource::Unknown);
    let (window, url, keep_apple_flow) = match source {
        BillingSource::Apple => (apple_reader(&app)?, APPLE_ACCOUNT_URL, true),
        BillingSource::Google => (
            external_window(
                &app,
                "subscription-login-google",
                "额度助手 · Google Play 订阅",
                GOOGLE_SUBSCRIPTIONS_URL,
                false,
            )?,
            GOOGLE_SUBSCRIPTIONS_URL,
            false,
        ),
        BillingSource::Web if provider == "claude" => {
            let window = claude_auth::ensure_auth_window(&app)?;
            (window, "https://claude.ai/settings/billing", false)
        }
        BillingSource::Web => (
            external_window(
                &app,
                "subscription-login-chatgpt",
                "额度助手 · ChatGPT 订阅",
                "https://chatgpt.com/#settings/Subscription",
                false,
            )?,
            "https://chatgpt.com/#settings/Subscription",
            false,
        ),
        BillingSource::Unknown if provider == "claude" => {
            claude_auth::connect_claude(app).await?;
            return Ok(());
        }
        BillingSource::Unknown => (chatgpt_reader(&app)?, CHATGPT_LOGIN_URL, false),
    };
    let preserve_current_page = keep_apple_flow
        && window.url().ok().is_some_and(|current| {
            (current.host_str() == Some("account.apple.com")
                && current.path().contains("/account/manage"))
                || (current.host_str() == Some("apps.apple.com")
                    && current.path().contains("/authenticate"))
                || current
                    .host_str()
                    .is_some_and(|host| host.ends_with("idmsa.apple.com"))
        });
    if !preserve_current_page {
        window
            .navigate(url.parse().map_err(|_| "官方登录地址无效".to_string())?)
            .map_err(|_| "无法打开官方登录页面".to_string())?;
    }
    window
        .show()
        .map_err(|_| "无法显示官方登录页面".to_string())?;
    window
        .set_focus()
        .map_err(|_| "无法激活官方登录页面".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chinese_apple_subscription() {
        let text = "订阅\n订阅中\nChatGPT\nChatGPT Pro 5x\n$100.00\n8月8日续期\nClaude\nClaude Pro - Monthly\n$20.00\n8月8日续期";
        let chatgpt = parse_apple_item(text, "codex").unwrap();
        let claude = parse_apple_item(text, "claude").unwrap();
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
    fn recognizes_a_signed_in_chinese_apple_account() {
        let text = "Apple 账户\n退出登录\n订阅\n在设备上管理";
        assert!(apple_account_is_ready(text));
    }

    #[test]
    fn rejects_an_apple_sign_in_page() {
        let text = "登录 Apple 账户\n电子邮件地址\n订阅";
        assert!(!apple_account_is_ready(text));
    }
}
