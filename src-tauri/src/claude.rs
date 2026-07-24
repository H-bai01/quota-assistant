use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, REFERER};
use serde_json::Value;
use tauri::AppHandle;

use crate::{
    claude_auth,
    models::{ProviderSnapshot, UsageWindow},
};

const ORGANIZATIONS_URL: &str = "https://claude.ai/api/organizations";
const ACCOUNT_URL: &str = "https://claude.ai/api/account";
const MAX_RESPONSE_BYTES: u64 = 1024 * 1024;

fn failure(status: &str, message: &str) -> ProviderSnapshot {
    ProviderSnapshot::failure_for("claude", "CLAUDE", status, message)
}

fn headers(cookie: &str) -> Result<HeaderMap, &'static str> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(REFERER, HeaderValue::from_static("https://claude.ai/"));
    let mut cookie = HeaderValue::from_str(cookie).map_err(|_| "Claude login data is invalid.")?;
    cookie.set_sensitive(true);
    headers.insert(COOKIE, cookie);
    Ok(headers)
}

async fn limited_json(mut response: reqwest::Response) -> Result<Value, ()> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err(());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if bytes.len().saturating_add(chunk.len()) as u64 > MAX_RESPONSE_BYTES {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| ())
}

fn string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| value.get(*key)?.as_str())
}

fn number(value: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| value.get(*key)?.as_f64())
}

fn timestamp(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let item = value.get(*key)?;
        if let Some(text) = item.as_str() {
            return Some(text.to_owned());
        }
        item.as_i64()
            .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
            .map(|time| time.to_rfc3339())
    })
}

fn organization(value: &Value) -> Option<&Value> {
    value
        .as_array()
        .and_then(|items| items.first())
        .or_else(|| value.get("organizations")?.as_array()?.first())
        .or_else(|| value.get("organization"))
}

fn plan_name(organization: &Value, account: Option<&Value>) -> Option<String> {
    let keys = [
        "plan_type",
        "planType",
        "subscription_type",
        "subscriptionType",
        "subscription_plan",
        "subscriptionPlan",
        "rate_limit_tier",
        "rateLimitTier",
        "tier",
    ];
    string(organization, &keys)
        .or_else(|| {
            organization
                .get("capabilities")
                .and_then(|value| string(value, &keys))
        })
        .or_else(|| account.and_then(|value| string(value, &keys)))
        .map(|value| value.replace("claude_", "").to_uppercase())
}

fn parse_window(value: Option<&Value>, seconds: u64) -> Option<UsageWindow> {
    let value = value?;
    let remaining = number(
        value,
        &[
            "remaining_percent",
            "remainingPercent",
            "remaining_pct",
            "remainingPct",
            "remaining",
        ],
    )
    .or_else(|| {
        number(
            value,
            &[
                "utilization",
                "utilization_pct",
                "utilizationPct",
                "used_percent",
                "usedPercent",
                "percent",
            ],
        )
        .map(|used| 100.0 - used)
    })?;
    Some(UsageWindow {
        remaining_percent: remaining.clamp(0.0, 100.0),
        resets_at: timestamp(
            value,
            &["resets_at", "resetsAt", "reset_at", "resetAt", "reset_time"],
        ),
        window_seconds: seconds,
    })
}

fn find_window<'a>(usage: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| usage.get(*key)).or_else(|| {
        usage
            .get("rate_limits")
            .or_else(|| usage.get("rateLimits"))
            .and_then(|limits| keys.iter().find_map(|key| limits.get(*key)))
    })
}

fn safe_http_failure(status: reqwest::StatusCode) -> ProviderSnapshot {
    match status.as_u16() {
        401 | 403 => failure(
            "signed_out",
            "Claude login expired. Please connect Claude again.",
        ),
        429 => failure(
            "unavailable",
            "Claude quota service is rate limited. It will retry automatically.",
        ),
        _ => failure(
            "unavailable",
            "Claude quota service is temporarily unavailable.",
        ),
    }
}

pub async fn fetch_snapshot(client: &reqwest::Client, app: &AppHandle) -> ProviderSnapshot {
    let cookie = match claude_auth::cookie_header(app) {
        Ok(Some(value)) => value,
        Ok(None) => return failure("signed_out", "Connect Claude to view its quota."),
        Err(message) => return failure("unavailable", &message),
    };
    let request_headers = match headers(&cookie) {
        Ok(value) => value,
        Err(message) => return failure("signed_out", message),
    };

    let organizations_response = match client
        .get(ORGANIZATIONS_URL)
        .headers(request_headers.clone())
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => return safe_http_failure(response.status()),
        Err(_) => {
            return failure(
                "unavailable",
                "Network unavailable. It will retry automatically.",
            )
        }
    };
    let organizations = match limited_json(organizations_response).await {
        Ok(value) => value,
        Err(_) => return failure("unavailable", "Claude organization response has changed."),
    };
    let organization = match organization(&organizations) {
        Some(value) => value,
        None => {
            return failure(
                "signed_out",
                "No Claude organization is available for this login.",
            )
        }
    };
    let organization_id = match string(
        organization,
        &["uuid", "id", "organization_id", "organizationId"],
    ) {
        Some(value) => value.to_owned(),
        None => return failure("unavailable", "Claude organization response has changed."),
    };

    let usage_url = format!("https://claude.ai/api/organizations/{organization_id}/usage");
    let (usage_result, account_result) = tokio::join!(
        client
            .get(usage_url)
            .headers(request_headers.clone())
            .send(),
        client.get(ACCOUNT_URL).headers(request_headers).send(),
    );

    let usage_response = match usage_result {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => return safe_http_failure(response.status()),
        Err(_) => {
            return failure(
                "unavailable",
                "Network unavailable. It will retry automatically.",
            )
        }
    };
    let usage = match limited_json(usage_response).await {
        Ok(value) => value,
        Err(_) => return failure("unavailable", "Claude quota response has changed."),
    };
    let account = match account_result {
        Ok(response) if response.status().is_success() => limited_json(response).await.ok(),
        _ => None,
    };

    let short_window = parse_window(
        find_window(
            &usage,
            &["five_hour", "fiveHour", "five_hours", "short_window"],
        ),
        18_000,
    );
    let weekly_window = parse_window(
        find_window(
            &usage,
            &["seven_day", "sevenDay", "weekly", "weekly_window"],
        ),
        604_800,
    );
    if short_window.is_none() && weekly_window.is_none() {
        return failure(
            "unavailable",
            "Claude quota response does not contain a supported usage window.",
        );
    }

    let subscription_expires_at = account.as_ref().and_then(|value| {
        timestamp(
            value,
            &[
                "subscription_expires_at",
                "subscriptionExpiresAt",
                "subscription_expiration",
                "expires_at",
            ],
        )
    });

    ProviderSnapshot {
        provider: "claude".into(),
        display_name: "CLAUDE".into(),
        plan: plan_name(organization, account.as_ref()),
        short_window,
        weekly_window,
        reset_credits: None,
        reset_credit_expires_at: Vec::new(),
        subscription_expires_at,
        updated_at: chrono::Utc::now().to_rfc3339(),
        status: "ok".into(),
        message: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claude_usage_windows() {
        let usage = serde_json::json!({
            "five_hour": {"utilization": 24.5, "resets_at": "2026-07-24T12:00:00Z"},
            "seven_day": {"utilization": 61.0, "resets_at": "2026-07-28T12:00:00Z"}
        });
        let short = parse_window(find_window(&usage, &["five_hour"]), 18_000).unwrap();
        let weekly = parse_window(find_window(&usage, &["seven_day"]), 604_800).unwrap();
        assert_eq!(short.remaining_percent, 75.5);
        assert_eq!(weekly.remaining_percent, 39.0);
    }
}
