use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub remaining_percent: f64,
    pub resets_at: Option<String>,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub short_window: Option<UsageWindow>,
    pub weekly_window: Option<UsageWindow>,
    pub reset_credits: Option<u64>,
    pub reset_credit_expires_at: Vec<String>,
    pub subscription_expires_at: Option<String>,
    pub updated_at: String,
    pub status: String,
    pub message: Option<String>,
}

impl ProviderSnapshot {
    pub fn failure(status: &str, message: &str) -> Self {
        Self::failure_for("codex", "CODEX", status, message)
    }

    pub fn failure_for(provider: &str, display_name: &str, status: &str, message: &str) -> Self {
        Self {
            provider: provider.into(),
            display_name: display_name.into(),
            plan: None,
            short_window: None,
            weekly_window: None,
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            subscription_expires_at: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionSnapshot {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub billing_source: String,
    pub cycle: Option<String>,
    pub renews_at: Option<String>,
    pub renewal_label: Option<String>,
    pub remaining_days: Option<i64>,
    pub status: String,
    pub message: Option<String>,
    pub updated_at: String,
}

impl SubscriptionSnapshot {
    pub fn pending(provider: &str, display_name: &str, billing_source: &str) -> Self {
        Self {
            provider: provider.into(),
            display_name: display_name.into(),
            plan: None,
            billing_source: billing_source.into(),
            cycle: None,
            renews_at: None,
            renewal_label: None,
            remaining_days: None,
            status: "loading".into(),
            message: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn failure(
        provider: &str,
        display_name: &str,
        billing_source: &str,
        status: &str,
        message: &str,
    ) -> Self {
        let mut value = Self::pending(provider, display_name, billing_source);
        value.status = status.into();
        value.message = Some(message.into());
        value
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPreferences {
    pub locked: bool,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(default)]
    pub stay_expanded: bool,
    pub pinned_provider: Option<String>,
    pub auto_rotate_seconds: u64,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_always_on_top() -> bool {
    true
}
fn default_language() -> String {
    "zh-CN".into()
}

impl Default for WidgetPreferences {
    fn default() -> Self {
        Self {
            locked: false,
            always_on_top: true,
            stay_expanded: false,
            pinned_provider: None,
            auto_rotate_seconds: 12,
            language: default_language(),
        }
    }
}

impl WidgetPreferences {
    pub fn normalized(mut self) -> Self {
        self.auto_rotate_seconds = self.auto_rotate_seconds.clamp(5, 300);
        if !matches!(self.pinned_provider.as_deref(), Some("codex" | "claude")) {
            self.pinned_provider = None;
        }
        if self.language != "en" && self.language != "zh-CN" {
            self.language = default_language();
        }
        self
    }
}
