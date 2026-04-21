use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use url::Url;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub const DEFAULT_OPENAI_PROVIDER_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_DEEPSEEK_PROVIDER_BASE_URL: &str = "https://api.deepseek.com/v1";
pub const DEFAULT_OPENAI_PROVIDER_MODEL: &str = "gpt-5.4";
pub const DEFAULT_DEEPSEEK_CHAT_MODEL: &str = "deepseek-chat";
pub const DEFAULT_DEEPSEEK_REASONER_MODEL: &str = "deepseek-reasoner";
const RUNTIME_PROVIDER_MIN_API_KEY_LEN: usize = 12;

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

    pub fn default_model(self) -> &'static str {
        match self {
            Self::Openai => DEFAULT_OPENAI_PROVIDER_MODEL,
            Self::Deepseek => DEFAULT_DEEPSEEK_CHAT_MODEL,
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

    pub fn validate(&self) -> AppResult<()> {
        validate_runtime_provider_profile(self)
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.trim().is_empty() && self.validate().is_ok()
    }

    pub fn effective_model(&self) -> String {
        resolve_runtime_provider_effective_model(self)
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

pub fn validate_runtime_provider_profiles(profiles: &[RuntimeProviderProfile]) -> AppResult<()> {
    for (index, profile) in profiles.iter().enumerate() {
        validate_runtime_provider_profile_with_context(profile, index + 1)?;
    }

    Ok(())
}

pub fn validate_runtime_provider_profile(profile: &RuntimeProviderProfile) -> AppResult<()> {
    validate_runtime_provider_profile_with_context(profile, 1)
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

pub fn resolve_runtime_provider_effective_model(profile: &RuntimeProviderProfile) -> String {
    let trimmed_model = profile.model.trim();
    if trimmed_model.is_empty() {
        profile.vendor.default_model().to_string()
    } else {
        trimmed_model.to_string()
    }
}

pub fn uses_deepseek_background_compile_models(profile: &RuntimeProviderProfile) -> bool {
    profile.vendor == RuntimeProviderVendor::Deepseek
        || is_deepseek_runtime_provider_model(&resolve_runtime_provider_effective_model(profile))
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

fn normalize_runtime_provider_api_key(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_runtime_provider_model(value: &str) -> String {
    value.trim().to_string()
}

fn generate_runtime_provider_profile_id() -> String {
    format!("provider_{}", Uuid::now_v7().simple())
}

pub fn is_deepseek_runtime_provider_model(value: &str) -> bool {
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

fn validate_runtime_provider_profile_with_context(
    profile: &RuntimeProviderProfile,
    index: usize,
) -> AppResult<()> {
    let profile_context = runtime_provider_profile_context(profile, index);
    let base_url = normalize_runtime_provider_base_url(&profile.base_url, profile.vendor);
    let api_key = normalize_runtime_provider_api_key(&profile.api_key);
    let model = normalize_runtime_provider_model(&profile.model);

    validate_runtime_provider_base_url(&base_url, &profile_context)?;
    validate_runtime_provider_model(&model, &profile_context)?;
    validate_runtime_provider_api_key(&api_key, &profile_context)?;
    Ok(())
}

fn runtime_provider_profile_context(profile: &RuntimeProviderProfile, index: usize) -> String {
    let trimmed_name = profile.name.trim();
    if trimmed_name.is_empty() {
        format!("runtime provider #{index}")
    } else {
        format!("runtime provider \"{trimmed_name}\"")
    }
}

fn validate_runtime_provider_base_url(base_url: &str, profile_context: &str) -> AppResult<()> {
    let parsed_url = Url::parse(base_url).map_err(|_| {
        AppError::validation(format!("{profile_context} baseUrl must be a valid URL"))
    })?;

    if parsed_url.scheme() != "https" {
        return Err(AppError::validation(format!(
            "{profile_context} baseUrl must use https"
        )));
    }

    if !parsed_url.username().is_empty() || parsed_url.password().is_some() {
        return Err(AppError::validation(format!(
            "{profile_context} baseUrl cannot include credentials"
        )));
    }

    Ok(())
}

fn validate_runtime_provider_model(model: &str, profile_context: &str) -> AppResult<()> {
    if model.is_empty() {
        return Ok(());
    }

    if model.chars().any(char::is_whitespace) {
        return Err(AppError::validation(format!(
            "{profile_context} model cannot contain whitespace"
        )));
    }

    Ok(())
}

fn validate_runtime_provider_api_key(api_key: &str, profile_context: &str) -> AppResult<()> {
    if api_key.is_empty() {
        return Ok(());
    }

    if api_key.chars().any(char::is_whitespace) {
        return Err(AppError::validation(format!(
            "{profile_context} apiKey cannot contain whitespace"
        )));
    }

    if api_key.chars().count() < RUNTIME_PROVIDER_MIN_API_KEY_LEN {
        return Err(AppError::validation(format!(
            "{profile_context} apiKey must be at least {RUNTIME_PROVIDER_MIN_API_KEY_LEN} characters"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        default_runtime_provider_profile, uses_deepseek_background_compile_models,
        validate_runtime_provider_profile, validate_runtime_provider_profiles,
        RuntimeProviderVendor,
    };

    #[test]
    fn rejects_non_https_runtime_provider_base_url() {
        let mut profile = default_runtime_provider_profile(1);
        profile.base_url = "http://api.openai.com/v1".into();

        let error = validate_runtime_provider_profile(&profile).unwrap_err();
        assert_eq!(
            error.to_string(),
            "runtime provider \"Provider 1\" baseUrl must use https"
        );
    }

    #[test]
    fn rejects_runtime_provider_base_url_with_credentials() {
        let mut profile = default_runtime_provider_profile(1);
        profile.base_url = "https://user:secret@api.openai.com/v1".into();

        let error = validate_runtime_provider_profile(&profile).unwrap_err();
        assert_eq!(
            error.to_string(),
            "runtime provider \"Provider 1\" baseUrl cannot include credentials"
        );
    }

    #[test]
    fn rejects_runtime_provider_model_with_whitespace() {
        let mut profile = default_runtime_provider_profile(1);
        profile.model = "gpt 5.4".into();

        let error = validate_runtime_provider_profile(&profile).unwrap_err();
        assert_eq!(
            error.to_string(),
            "runtime provider \"Provider 1\" model cannot contain whitespace"
        );
    }

    #[test]
    fn rejects_runtime_provider_api_key_with_whitespace() {
        let mut profile = default_runtime_provider_profile(1);
        profile.api_key = "sk-test-1234 5678".into();

        let error = validate_runtime_provider_profile(&profile).unwrap_err();
        assert_eq!(
            error.to_string(),
            "runtime provider \"Provider 1\" apiKey cannot contain whitespace"
        );
    }

    #[test]
    fn rejects_runtime_provider_api_key_that_is_too_short() {
        let mut profile = default_runtime_provider_profile(1);
        profile.api_key = "short-key".into();

        let error = validate_runtime_provider_profile(&profile).unwrap_err();
        assert_eq!(
            error.to_string(),
            "runtime provider \"Provider 1\" apiKey must be at least 12 characters"
        );
    }

    #[test]
    fn accepts_normalized_runtime_provider_profiles() {
        let mut openai = default_runtime_provider_profile(1);
        openai.api_key = "  sk-test-12345678901234567890  ".into();
        openai.base_url = " https://api.openai.com/v1/ ".into();
        openai.model = " gpt-5.4-mini ".into();

        let mut deepseek = default_runtime_provider_profile(2);
        deepseek.vendor = RuntimeProviderVendor::Deepseek;
        deepseek.name = "DeepSeek".into();
        deepseek.api_key = "sk-test-abcdefghijklmnop".into();
        deepseek.base_url = "https://api.deepseek.com/v1".into();
        deepseek.model = "deepseek-chat".into();

        let profiles = vec![
            openai.normalized("Provider 1"),
            deepseek.normalized("Provider 2"),
        ];

        validate_runtime_provider_profiles(&profiles).expect("profiles should validate");
    }

    #[test]
    fn explicit_deepseek_model_enables_deepseek_background_compile_mode() {
        let mut profile = default_runtime_provider_profile(1);
        profile.vendor = RuntimeProviderVendor::Openai;
        profile.model = "deepseek-chat".into();

        assert!(uses_deepseek_background_compile_models(&profile));
    }

    #[test]
    fn host_alone_does_not_switch_background_compile_to_deepseek_models() {
        let mut profile = default_runtime_provider_profile(1);
        profile.vendor = RuntimeProviderVendor::Openai;
        profile.base_url = "https://api.deepseek.com/v1".into();
        profile.model = String::new();

        assert!(!uses_deepseek_background_compile_models(&profile));
    }
}
