use std::path::{Path, PathBuf};

pub const APP_ENV_DEVELOPMENT: &str = "development";
pub const APP_ENV_STAGING: &str = "staging";
pub const APP_ENV_PRODUCTION: &str = "production";

pub const DATA_CHANNEL_SHARED: &str = "shared";
pub const DATA_CHANNEL_PRODUCTION: &str = "production";

pub fn app_env() -> &'static str {
    match option_env!("TINO_APP_ENV") {
        Some(APP_ENV_DEVELOPMENT) => APP_ENV_DEVELOPMENT,
        Some(APP_ENV_STAGING) => APP_ENV_STAGING,
        Some(APP_ENV_PRODUCTION) | Some("prod") => APP_ENV_PRODUCTION,
        _ if cfg!(debug_assertions) => APP_ENV_DEVELOPMENT,
        _ => APP_ENV_PRODUCTION,
    }
}

pub fn data_channel() -> &'static str {
    match option_env!("TINO_DATA_CHANNEL") {
        Some(DATA_CHANNEL_SHARED) => DATA_CHANNEL_SHARED,
        Some(DATA_CHANNEL_PRODUCTION) | Some("prod") => DATA_CHANNEL_PRODUCTION,
        _ if cfg!(debug_assertions) => DATA_CHANNEL_SHARED,
        _ => DATA_CHANNEL_PRODUCTION,
    }
}

pub fn default_knowledge_root(home_dir: &Path) -> PathBuf {
    match data_channel() {
        DATA_CHANNEL_SHARED => home_dir.join("tino-inbox-preview"),
        DATA_CHANNEL_PRODUCTION => home_dir.join("tino-inbox-production"),
        other => home_dir.join(format!("tino-inbox-{other}")),
    }
}

pub fn build_channel_label() -> String {
    format!("{} ({})", app_env(), data_channel())
}
