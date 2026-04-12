use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

use crate::runtime_profile;

pub(crate) const SETTINGS_FILE_NAME: &str = "settings.json";
pub(crate) const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
pub(crate) const CLIPBOARD_CACHE_DIR_NAME: &str = "clipboard-cache";

const MIGRATION_STATE_FILE_NAME: &str = "migration-state.json";
const MACOS_APP_SUPPORT_DIR_NAME: &str = "Application Support";
const MACOS_LIBRARY_DIR_NAME: &str = "Library";
const STABLE_APP_STORAGE_DIR_NAME: &str = "Tino";
const MIGRATION_STATE_VERSION: u8 = 1;

#[derive(Debug, Clone)]
pub(crate) struct DurableAppPaths {
    pub data_dir: PathBuf,
    pub clipboard_cache_dir: PathBuf,
    pub settings_path: PathBuf,
    pub window_state_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct CandidateScore {
    has_clipboard_cache: bool,
    has_settings: bool,
    has_window_state: bool,
    clipboard_entry_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppDataMigrationState {
    version: u8,
    data_channel: String,
    outcome: String,
    completed_at: String,
    #[serde(default)]
    source_dir: Option<String>,
}

pub(crate) fn resolve_durable_app_paths(app: &AppHandle) -> Result<DurableAppPaths, String> {
    let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
    let current_app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let data_channel = runtime_profile::data_channel();
    let data_dir = durable_app_data_dir(&home_dir, &current_app_data_dir, data_channel);

    Ok(DurableAppPaths {
        clipboard_cache_dir: data_dir.join(CLIPBOARD_CACHE_DIR_NAME),
        settings_path: data_dir.join(SETTINGS_FILE_NAME),
        window_state_path: data_dir.join(WINDOW_STATE_FILE_NAME),
        data_dir,
    })
}

pub(crate) fn bootstrap_durable_app_storage(app: &AppHandle) -> Result<DurableAppPaths, String> {
    let paths = resolve_durable_app_paths(app)?;
    let current_app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let data_channel = runtime_profile::data_channel();

    migrate_legacy_app_data_if_needed(&paths.data_dir, &current_app_data_dir, data_channel)?;
    fs::create_dir_all(&paths.data_dir).map_err(|error| error.to_string())?;

    Ok(paths)
}

fn durable_app_data_dir(
    home_dir: &Path,
    _current_app_data_dir: &Path,
    data_channel: &str,
) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        return home_dir
            .join(MACOS_LIBRARY_DIR_NAME)
            .join(MACOS_APP_SUPPORT_DIR_NAME)
            .join(STABLE_APP_STORAGE_DIR_NAME)
            .join(data_channel);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = home_dir;
        let _ = data_channel;
        _current_app_data_dir.to_path_buf()
    }
}

fn migrate_legacy_app_data_if_needed(
    stable_data_dir: &Path,
    current_app_data_dir: &Path,
    data_channel: &str,
) -> Result<(), String> {
    let migration_state_path = stable_data_dir.join(MIGRATION_STATE_FILE_NAME);
    if migration_state_path.exists() {
        return Ok(());
    }

    if candidate_score(stable_data_dir)?.is_some() {
        fs::create_dir_all(stable_data_dir).map_err(|error| error.to_string())?;
        write_migration_state(stable_data_dir, data_channel, "existing_stable_root", None)?;
        return Ok(());
    }

    let candidates =
        legacy_app_data_candidates(stable_data_dir, current_app_data_dir, data_channel);
    let Some(source_dir) = select_best_candidate(&candidates)? else {
        fs::create_dir_all(stable_data_dir).map_err(|error| error.to_string())?;
        write_migration_state(stable_data_dir, data_channel, "fresh_install", None)?;
        return Ok(());
    };

    let staging_dir = migration_staging_dir(stable_data_dir);
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    }
    if stable_data_dir.exists() {
        fs::remove_dir_all(stable_data_dir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    copy_managed_app_data(&source_dir, &staging_dir)?;

    if let Some(parent) = stable_data_dir.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(&staging_dir, stable_data_dir).map_err(|error| error.to_string())?;
    write_migration_state(
        stable_data_dir,
        data_channel,
        "migrated_legacy_app_data",
        Some(&source_dir),
    )?;
    log::info!(
        "migrated durable app data from {} to {}",
        source_dir.display(),
        stable_data_dir.display()
    );
    Ok(())
}

fn legacy_app_data_candidates(
    stable_data_dir: &Path,
    current_app_data_dir: &Path,
    data_channel: &str,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    push_candidate(&mut candidates, stable_data_dir, current_app_data_dir);

    let Some(app_support_dir) = current_app_data_dir.parent() else {
        return candidates;
    };

    for identifier in legacy_identifiers_for_channel(data_channel) {
        push_candidate(
            &mut candidates,
            stable_data_dir,
            &app_support_dir.join(identifier),
        );
    }

    candidates
}

fn legacy_identifiers_for_channel(data_channel: &str) -> &'static [&'static str] {
    match data_channel {
        runtime_profile::DATA_CHANNEL_PRODUCTION => &[
            "com.louistation.tino.production",
            "com.louistation.tino.preview",
            "com.louistation.tino",
        ],
        _ => &[
            "com.louistation.tino.preview",
            "com.louistation.tino.development",
            "com.louistation.tino",
        ],
    }
}

fn push_candidate(candidates: &mut Vec<PathBuf>, stable_data_dir: &Path, candidate: &Path) {
    if candidate == stable_data_dir {
        return;
    }
    if candidates.iter().any(|existing| existing == candidate) {
        return;
    }
    candidates.push(candidate.to_path_buf());
}

fn select_best_candidate(candidates: &[PathBuf]) -> Result<Option<PathBuf>, String> {
    let mut best_candidate: Option<(PathBuf, CandidateScore)> = None;

    for candidate in candidates {
        let Some(score) = candidate_score(candidate)? else {
            continue;
        };

        let should_replace = match &best_candidate {
            Some((_, best_score)) => score > *best_score,
            None => true,
        };

        if should_replace {
            best_candidate = Some((candidate.clone(), score));
        }
    }

    Ok(best_candidate.map(|(candidate, _)| candidate))
}

fn candidate_score(candidate_dir: &Path) -> Result<Option<CandidateScore>, String> {
    if !candidate_dir.exists() {
        return Ok(None);
    }

    let settings_path = candidate_dir.join(SETTINGS_FILE_NAME);
    let window_state_path = candidate_dir.join(WINDOW_STATE_FILE_NAME);
    let clipboard_cache_dir = candidate_dir.join(CLIPBOARD_CACHE_DIR_NAME);

    let has_settings = settings_path.is_file();
    let has_window_state = window_state_path.is_file();
    let clipboard_entry_count = count_directory_entries_recursive(&clipboard_cache_dir)?;
    let has_clipboard_cache = clipboard_entry_count > 0;

    if !has_settings && !has_window_state && !has_clipboard_cache {
        return Ok(None);
    }

    Ok(Some(CandidateScore {
        has_clipboard_cache,
        has_settings,
        has_window_state,
        clipboard_entry_count,
    }))
}

fn count_directory_entries_recursive(root: &Path) -> Result<usize, String> {
    if !root.exists() {
        return Ok(0);
    }
    if root.is_file() {
        return Ok(1);
    }

    let mut count = 0usize;
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        count += 1;
        if path.is_dir() {
            count += count_directory_entries_recursive(&path)?;
        }
    }

    Ok(count)
}

fn copy_managed_app_data(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    let mut copied_any = false;

    copied_any |= copy_path_if_exists(
        &source_dir.join(SETTINGS_FILE_NAME),
        &target_dir.join(SETTINGS_FILE_NAME),
    )?;
    copied_any |= copy_path_if_exists(
        &source_dir.join(WINDOW_STATE_FILE_NAME),
        &target_dir.join(WINDOW_STATE_FILE_NAME),
    )?;
    copied_any |= copy_path_if_exists(
        &source_dir.join(CLIPBOARD_CACHE_DIR_NAME),
        &target_dir.join(CLIPBOARD_CACHE_DIR_NAME),
    )?;

    if !copied_any {
        return Err(format!(
            "legacy app data source {} did not contain managed artifacts",
            source_dir.display()
        ));
    }

    Ok(())
}

fn copy_path_if_exists(source: &Path, target: &Path) -> Result<bool, String> {
    if !source.exists() {
        return Ok(false);
    }

    copy_path_recursive(source, target)?;
    Ok(true)
}

fn copy_path_recursive(source: &Path, target: &Path) -> Result<(), String> {
    if source.is_file() {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(source, target).map_err(|error| error.to_string())?;
        return Ok(());
    }

    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        copy_path_recursive(&source_path, &target_path)?;
    }
    Ok(())
}

fn migration_staging_dir(stable_data_dir: &Path) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let file_name = stable_data_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("app-data");

    stable_data_dir.with_file_name(format!(".{file_name}.migration-{suffix}"))
}

fn write_migration_state(
    stable_data_dir: &Path,
    data_channel: &str,
    outcome: &str,
    source_dir: Option<&Path>,
) -> Result<(), String> {
    fs::create_dir_all(stable_data_dir).map_err(|error| error.to_string())?;
    let state = AppDataMigrationState {
        version: MIGRATION_STATE_VERSION,
        data_channel: data_channel.to_string(),
        outcome: outcome.to_string(),
        completed_at: Local::now().to_rfc3339(),
        source_dir: source_dir.map(|path| path.display().to_string()),
    };
    let bytes = serde_json::to_vec_pretty(&state).map_err(|error| error.to_string())?;
    fs::write(stable_data_dir.join(MIGRATION_STATE_FILE_NAME), bytes)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!("tino-app-path-tests-{}", Uuid::now_v7().simple()))
    }

    fn write_json(path: &Path, value: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent directory should initialize");
        }
        fs::write(path, value).expect("test file should write");
    }

    #[test]
    fn shared_channel_prefers_legacy_root_with_clipboard_history_over_settings_only_preview_root() {
        let root = unique_root();
        let home_dir = root.join("home");
        let app_support_dir = home_dir
            .join(MACOS_LIBRARY_DIR_NAME)
            .join(MACOS_APP_SUPPORT_DIR_NAME);
        let stable_dir = app_support_dir
            .join(STABLE_APP_STORAGE_DIR_NAME)
            .join("shared");
        let preview_dir = app_support_dir.join("com.louistation.tino.preview");
        let legacy_dir = app_support_dir.join("com.louistation.tino");

        write_json(
            &preview_dir.join(SETTINGS_FILE_NAME),
            r#"{"knowledgeRoot":"preview-default"}"#,
        );
        write_json(
            &legacy_dir.join(SETTINGS_FILE_NAME),
            r#"{"knowledgeRoot":"legacy-root"}"#,
        );
        write_json(
            &legacy_dir
                .join(CLIPBOARD_CACHE_DIR_NAME)
                .join("clipboard")
                .join("2026-04-12.jsonl"),
            r#"{"id":"cap_1"}"#,
        );

        migrate_legacy_app_data_if_needed(
            &stable_dir,
            &preview_dir,
            runtime_profile::DATA_CHANNEL_SHARED,
        )
        .expect("migration should succeed");

        let migrated_settings = fs::read_to_string(stable_dir.join(SETTINGS_FILE_NAME))
            .expect("settings should migrate");
        let migrated_history = stable_dir
            .join(CLIPBOARD_CACHE_DIR_NAME)
            .join("clipboard")
            .join("2026-04-12.jsonl");

        assert!(migrated_settings.contains("legacy-root"));
        assert!(migrated_history.exists());
        assert!(stable_dir.join(MIGRATION_STATE_FILE_NAME).exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn existing_stable_root_is_kept_without_copying_legacy_source() {
        let root = unique_root();
        let home_dir = root.join("home");
        let app_support_dir = home_dir
            .join(MACOS_LIBRARY_DIR_NAME)
            .join(MACOS_APP_SUPPORT_DIR_NAME);
        let stable_dir = app_support_dir
            .join(STABLE_APP_STORAGE_DIR_NAME)
            .join("shared");
        let preview_dir = app_support_dir.join("com.louistation.tino.preview");
        let legacy_dir = app_support_dir.join("com.louistation.tino");

        write_json(
            &stable_dir.join(SETTINGS_FILE_NAME),
            r#"{"knowledgeRoot":"stable-root"}"#,
        );
        write_json(
            &legacy_dir.join(SETTINGS_FILE_NAME),
            r#"{"knowledgeRoot":"legacy-root"}"#,
        );
        write_json(
            &legacy_dir
                .join(CLIPBOARD_CACHE_DIR_NAME)
                .join("clipboard")
                .join("2026-04-12.jsonl"),
            r#"{"id":"cap_1"}"#,
        );

        migrate_legacy_app_data_if_needed(
            &stable_dir,
            &preview_dir,
            runtime_profile::DATA_CHANNEL_SHARED,
        )
        .expect("migration bookkeeping should succeed");

        let settings = fs::read_to_string(stable_dir.join(SETTINGS_FILE_NAME))
            .expect("stable settings should remain");

        assert!(settings.contains("stable-root"));
        assert!(!stable_dir
            .join(CLIPBOARD_CACHE_DIR_NAME)
            .join("clipboard")
            .join("2026-04-12.jsonl")
            .exists());
        assert!(stable_dir.join(MIGRATION_STATE_FILE_NAME).exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn production_channel_can_import_preview_history_on_first_run() {
        let root = unique_root();
        let home_dir = root.join("home");
        let app_support_dir = home_dir
            .join(MACOS_LIBRARY_DIR_NAME)
            .join(MACOS_APP_SUPPORT_DIR_NAME);
        let stable_dir = app_support_dir
            .join(STABLE_APP_STORAGE_DIR_NAME)
            .join("production");
        let production_dir = app_support_dir.join("com.louistation.tino.production");
        let preview_dir = app_support_dir.join("com.louistation.tino.preview");

        write_json(
            &preview_dir.join(SETTINGS_FILE_NAME),
            r#"{"knowledgeRoot":"preview-root"}"#,
        );
        write_json(
            &preview_dir
                .join(CLIPBOARD_CACHE_DIR_NAME)
                .join("clipboard")
                .join("2026-04-12.jsonl"),
            r#"{"id":"cap_1"}"#,
        );

        migrate_legacy_app_data_if_needed(
            &stable_dir,
            &production_dir,
            runtime_profile::DATA_CHANNEL_PRODUCTION,
        )
        .expect("preview fallback migration should succeed");

        let migrated_settings = fs::read_to_string(stable_dir.join(SETTINGS_FILE_NAME))
            .expect("settings should migrate from preview");

        assert!(migrated_settings.contains("preview-root"));
        assert!(stable_dir
            .join(CLIPBOARD_CACHE_DIR_NAME)
            .join("clipboard")
            .join("2026-04-12.jsonl")
            .exists());

        let _ = fs::remove_dir_all(root);
    }
}
