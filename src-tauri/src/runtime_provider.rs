use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use uuid::Uuid;

pub const DEFAULT_OPENAI_PROVIDER_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_DEEPSEEK_PROVIDER_BASE_URL: &str = "https://api.deepseek.com/v1";

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeProviderVendor {
    #[default]
    Openai,
    Deepseek,
}

impl RuntimeProviderVendor {
    pub fn default_base_url(self) -> &'static str {
        match self {
            Self::Openai => DEFAULT_OPENAI_PROVIDER_BASE_URL,
            Self::Deepseek => DEFAULT_DEEPSEEK_PROVIDER_BASE_URL,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProviderProfile {
    pub id: String,
    pub name: String,
    pub vendor: RuntimeProviderVendor,
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

impl RuntimeProviderProfile {
    pub fn normalized(mut self, fallback_name: &str) -> Self {
        self.id = normalize_runtime_provider_id(&self.id);
        if self.id.is_empty() {
            self.id = generate_runtime_provider_profile_id();
        }

        self.name = normalize_runtime_provider_name(&self.name, fallback_name);
        self.base_url = normalize_runtime_provider_base_url(&self.base_url, self.vendor);
        self.api_key = self.api_key.trim().to_string();
        self.model = normalize_runtime_provider_model(&self.model);
        self
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.trim().is_empty()
    }
}

pub fn default_runtime_provider_profile(index: usize) -> RuntimeProviderProfile {
    let vendor = RuntimeProviderVendor::default();

    RuntimeProviderProfile {
        id: generate_runtime_provider_profile_id(),
        name: default_runtime_provider_profile_name(index),
        vendor,
        base_url: vendor.default_base_url().into(),
        api_key: String::new(),
        model: String::new(),
    }
}

pub fn normalize_runtime_provider_profiles(
    profiles: Vec<RuntimeProviderProfile>,
) -> Vec<RuntimeProviderProfile> {
    let mut normalized = profiles
        .into_iter()
        .enumerate()
        .map(|(index, profile)| {
            profile.normalized(&default_runtime_provider_profile_name(index + 1))
        })
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        normalized.push(default_runtime_provider_profile(1));
    }

    let mut seen_ids = HashSet::new();
    for profile in &mut normalized {
        if seen_ids.insert(profile.id.clone()) {
            continue;
        }

        loop {
            let next_id = generate_runtime_provider_profile_id();
            if seen_ids.insert(next_id.clone()) {
                profile.id = next_id;
                break;
            }
        }
    }

    normalized
}

pub fn resolve_active_runtime_provider_id(
    profiles: &[RuntimeProviderProfile],
    active_id: &str,
) -> String {
    let trimmed_active_id = normalize_runtime_provider_id(active_id);
    if !trimmed_active_id.is_empty()
        && profiles
            .iter()
            .any(|profile| profile.id == trimmed_active_id)
    {
        return trimmed_active_id;
    }

    profiles
        .first()
        .map(|profile| profile.id.clone())
        .unwrap_or_else(generate_runtime_provider_profile_id)
}

pub fn infer_runtime_provider_vendor(base_url: &str, model: &str) -> RuntimeProviderVendor {
    if is_deepseek_runtime_provider_model(model) {
        return RuntimeProviderVendor::Deepseek;
    }

    match runtime_provider_host(base_url) {
        Some("api.deepseek.com") => RuntimeProviderVendor::Deepseek,
        _ => RuntimeProviderVendor::Openai,
    }
}

fn default_runtime_provider_profile_name(index: usize) -> String {
    format!("Provider {index}")
}

fn normalize_runtime_provider_id(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_runtime_provider_name(value: &str, fallback_name: &str) -> String {
    let trimmed_value = value.trim();
    if trimmed_value.is_empty() {
        return fallback_name.to_string();
    }

    trimmed_value.to_string()
}

fn normalize_runtime_provider_base_url(value: &str, vendor: RuntimeProviderVendor) -> String {
    let trimmed_value = value.trim().trim_end_matches('/');
    if trimmed_value.is_empty() {
        return vendor.default_base_url().to_string();
    }

    trimmed_value.to_string()
}

fn normalize_runtime_provider_model(value: &str) -> String {
    value.trim().to_string()
}

fn generate_runtime_provider_profile_id() -> String {
    format!("provider_{}", Uuid::now_v7().simple())
}

fn is_deepseek_runtime_provider_model(value: &str) -> bool {
    value.trim().to_lowercase().starts_with("deepseek-")
}

fn runtime_provider_host(base_url: &str) -> Option<&str> {
    let trimmed_value = base_url.trim();
    if trimmed_value.is_empty() {
        return None;
    }

    let without_scheme = trimmed_value.split("://").nth(1).unwrap_or(trimmed_value);
    let host_port = without_scheme.split('/').next().unwrap_or(without_scheme);
    let host_with_auth = host_port.rsplit('@').next().unwrap_or(host_port);
    let host = host_with_auth
        .split(':')
        .next()
        .unwrap_or(host_with_auth)
        .trim();

    (!host.is_empty()).then_some(host)
}
