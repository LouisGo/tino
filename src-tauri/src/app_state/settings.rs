use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use crate::locale::AppLocalePreference;
use crate::runtime_provider::{
    default_runtime_provider_profile, infer_runtime_provider_vendor,
    normalize_runtime_provider_profiles, resolve_active_runtime_provider_id,
    RuntimeProviderProfile,
};

const DEFAULT_CLIPBOARD_HISTORY_DAYS: u16 = 7;
const MIN_CLIPBOARD_HISTORY_DAYS: u16 = 1;
const MAX_CLIPBOARD_HISTORY_DAYS: u16 = 90;
const DEFAULT_CLIPBOARD_CAPTURE_ENABLED: bool = true;

fn default_clipboard_history_days() -> u16 {
    DEFAULT_CLIPBOARD_HISTORY_DAYS
}

fn default_clipboard_capture_enabled() -> bool {
    DEFAULT_CLIPBOARD_CAPTURE_ENABLED
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutOverride {
    #[serde(default)]
    pub accelerator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSourceAppRule {
    pub bundle_id: String,
    pub app_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSourceAppOption {
    pub bundle_id: String,
    pub app_name: String,
    pub app_path: Option<String>,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub knowledge_root: String,
    pub runtime_provider_profiles: Vec<RuntimeProviderProfile>,
    pub active_runtime_provider_id: String,
    #[serde(default)]
    pub locale_preference: AppLocalePreference,
    #[serde(default = "default_clipboard_history_days")]
    pub clipboard_history_days: u16,
    #[serde(default = "default_clipboard_capture_enabled")]
    pub clipboard_capture_enabled: bool,
    #[serde(default)]
    pub clipboard_excluded_source_apps: Vec<ClipboardSourceAppRule>,
    #[serde(default)]
    pub clipboard_excluded_keywords: Vec<String>,
    #[serde(default)]
    pub shortcut_overrides: BTreeMap<String, AppShortcutOverride>,
}

impl AppSettings {
    pub(super) fn defaults(default_knowledge_root: &Path) -> Self {
        let runtime_provider_profiles = vec![default_runtime_provider_profile(1)];
        let active_runtime_provider_id = runtime_provider_profiles[0].id.clone();

        Self {
            knowledge_root: default_knowledge_root.display().to_string(),
            runtime_provider_profiles,
            active_runtime_provider_id,
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: DEFAULT_CLIPBOARD_HISTORY_DAYS,
            clipboard_capture_enabled: DEFAULT_CLIPBOARD_CAPTURE_ENABLED,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: BTreeMap::new(),
        }
    }

    pub(super) fn normalized(mut self, default_knowledge_root: &Path) -> Self {
        let knowledge_root = if self.knowledge_root.trim().is_empty() {
            default_knowledge_root.to_path_buf()
        } else {
            expand_home_path(&self.knowledge_root, default_knowledge_root)
        };

        self.knowledge_root = knowledge_root.display().to_string();

        self.runtime_provider_profiles =
            normalize_runtime_provider_profiles(self.runtime_provider_profiles);
        self.active_runtime_provider_id = resolve_active_runtime_provider_id(
            &self.runtime_provider_profiles,
            &self.active_runtime_provider_id,
        );

        self.locale_preference = self.locale_preference.normalized();

        self.clipboard_history_days = self
            .clipboard_history_days
            .clamp(MIN_CLIPBOARD_HISTORY_DAYS, MAX_CLIPBOARD_HISTORY_DAYS);

        self.clipboard_excluded_source_apps =
            normalize_clipboard_source_app_rules(self.clipboard_excluded_source_apps);
        self.clipboard_excluded_keywords =
            normalize_clipboard_excluded_keywords(self.clipboard_excluded_keywords);

        self.shortcut_overrides = self
            .shortcut_overrides
            .into_iter()
            .filter_map(|(shortcut_id, shortcut_override)| {
                let shortcut_id = shortcut_id.trim();
                if shortcut_id.is_empty() {
                    return None;
                }

                let accelerator = shortcut_override
                    .accelerator
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());

                Some((shortcut_id.to_string(), AppShortcutOverride { accelerator }))
            })
            .collect();

        self
    }

    pub fn knowledge_root_path(&self) -> PathBuf {
        PathBuf::from(&self.knowledge_root)
    }

    pub fn active_runtime_provider(&self) -> Option<&RuntimeProviderProfile> {
        self.runtime_provider_profiles
            .iter()
            .find(|profile| profile.id == self.active_runtime_provider_id)
            .or_else(|| self.runtime_provider_profiles.first())
    }

    pub(super) fn ai_enabled(&self) -> bool {
        self.active_runtime_provider()
            .map(|provider| provider.is_configured())
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyAppSettings {
    pub knowledge_root: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub locale_preference: AppLocalePreference,
    #[serde(default = "default_clipboard_history_days")]
    pub clipboard_history_days: u16,
    #[serde(default = "default_clipboard_capture_enabled")]
    pub clipboard_capture_enabled: bool,
    #[serde(default)]
    pub clipboard_excluded_source_apps: Vec<ClipboardSourceAppRule>,
    #[serde(default)]
    pub clipboard_excluded_keywords: Vec<String>,
    #[serde(default)]
    pub shortcut_overrides: BTreeMap<String, AppShortcutOverride>,
}

impl LegacyAppSettings {
    fn into_current(self, default_knowledge_root: &Path) -> AppSettings {
        let mut settings = AppSettings::defaults(default_knowledge_root);
        let mut runtime_provider = default_runtime_provider_profile(1);
        runtime_provider.vendor = infer_runtime_provider_vendor(&self.base_url, &self.model);
        runtime_provider.base_url = self.base_url;
        runtime_provider.api_key = self.api_key;
        runtime_provider.model = self.model;

        settings.knowledge_root = self.knowledge_root;
        settings.runtime_provider_profiles = vec![runtime_provider];
        settings.active_runtime_provider_id = settings.runtime_provider_profiles[0].id.clone();
        settings.locale_preference = self.locale_preference;
        settings.clipboard_history_days = self.clipboard_history_days;
        settings.clipboard_capture_enabled = self.clipboard_capture_enabled;
        settings.clipboard_excluded_source_apps = self.clipboard_excluded_source_apps;
        settings.clipboard_excluded_keywords = self.clipboard_excluded_keywords;
        settings.shortcut_overrides = self.shortcut_overrides;
        settings
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyManagedRuntimeProviderProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

impl LegacyManagedRuntimeProviderProfile {
    fn into_current(self) -> RuntimeProviderProfile {
        RuntimeProviderProfile {
            id: self.id,
            name: self.name,
            vendor: infer_runtime_provider_vendor(&self.base_url, &self.model),
            base_url: self.base_url,
            api_key: self.api_key,
            model: self.model,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyManagedAppSettings {
    pub knowledge_root: String,
    pub runtime_provider_profiles: Vec<LegacyManagedRuntimeProviderProfile>,
    pub active_runtime_provider_id: String,
    #[serde(default)]
    pub locale_preference: AppLocalePreference,
    #[serde(default = "default_clipboard_history_days")]
    pub clipboard_history_days: u16,
    #[serde(default = "default_clipboard_capture_enabled")]
    pub clipboard_capture_enabled: bool,
    #[serde(default)]
    pub clipboard_excluded_source_apps: Vec<ClipboardSourceAppRule>,
    #[serde(default)]
    pub clipboard_excluded_keywords: Vec<String>,
    #[serde(default)]
    pub shortcut_overrides: BTreeMap<String, AppShortcutOverride>,
}

impl LegacyManagedAppSettings {
    fn into_current(self) -> AppSettings {
        AppSettings {
            knowledge_root: self.knowledge_root,
            runtime_provider_profiles: self
                .runtime_provider_profiles
                .into_iter()
                .map(LegacyManagedRuntimeProviderProfile::into_current)
                .collect(),
            active_runtime_provider_id: self.active_runtime_provider_id,
            locale_preference: self.locale_preference,
            clipboard_history_days: self.clipboard_history_days,
            clipboard_capture_enabled: self.clipboard_capture_enabled,
            clipboard_excluded_source_apps: self.clipboard_excluded_source_apps,
            clipboard_excluded_keywords: self.clipboard_excluded_keywords,
            shortcut_overrides: self.shortcut_overrides,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum PersistedAppSettings {
    Current(AppSettings),
    LegacyManaged(LegacyManagedAppSettings),
    LegacySingle(LegacyAppSettings),
}

pub(super) fn load_settings(
    settings_path: &Path,
    default_knowledge_root: &Path,
) -> Result<AppSettings, String> {
    let settings = if settings_path.exists() {
        let bytes = fs::read(settings_path).map_err(|error| error.to_string())?;
        match serde_json::from_slice::<PersistedAppSettings>(&bytes)
            .map_err(|error| error.to_string())?
        {
            PersistedAppSettings::Current(settings) => settings,
            PersistedAppSettings::LegacyManaged(settings) => settings.into_current(),
            PersistedAppSettings::LegacySingle(settings) => {
                settings.into_current(default_knowledge_root)
            }
        }
    } else {
        AppSettings::defaults(default_knowledge_root)
    }
    .normalized(default_knowledge_root);

    super::write_json_file(settings_path, &settings)?;

    Ok(settings)
}

fn normalize_bundle_id_key(bundle_id: &str) -> Option<String> {
    let trimmed = bundle_id.trim();

    (!trimmed.is_empty()).then(|| trimmed.to_ascii_lowercase())
}

fn normalize_clipboard_source_app_rules(
    rules: Vec<ClipboardSourceAppRule>,
) -> Vec<ClipboardSourceAppRule> {
    let mut seen_bundle_ids = HashSet::new();

    rules
        .into_iter()
        .filter_map(|rule| {
            let bundle_id = rule.bundle_id.trim();
            let bundle_id_key = normalize_bundle_id_key(bundle_id)?;
            if !seen_bundle_ids.insert(bundle_id_key) {
                return None;
            }

            let app_name = rule.app_name.trim();

            Some(ClipboardSourceAppRule {
                bundle_id: bundle_id.to_string(),
                app_name: if app_name.is_empty() {
                    bundle_id.to_string()
                } else {
                    app_name.to_string()
                },
            })
        })
        .collect()
}

fn normalize_clipboard_excluded_keywords(keywords: Vec<String>) -> Vec<String> {
    let mut seen_keywords = HashSet::new();
    let mut normalized = Vec::new();

    for candidate in keywords {
        for keyword in candidate.split([';', '；', '\n', '\r']) {
            let keyword = keyword.trim();
            if keyword.is_empty() {
                continue;
            }

            let dedupe_key = keyword.to_lowercase();
            if seen_keywords.insert(dedupe_key) {
                normalized.push(keyword.to_string());
            }
        }
    }

    normalized
}

fn expand_home_path(input: &str, default_knowledge_root: &Path) -> PathBuf {
    if let Some(stripped) = input.strip_prefix("~/") {
        if let Some(home_dir) = default_knowledge_root.parent() {
            return home_dir.join(stripped);
        }
    }

    PathBuf::from(input)
}
