use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use crate::clipboard::types::PinnedClipboardCapture;

const PINNED_CLIPBOARD_CAPTURES_FILE_NAME: &str = "pinned-captures.json";
pub(crate) const MAX_PINNED_CLIPBOARD_CAPTURES: usize = 5;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PinnedClipboardState {
    pub captures: Vec<PinnedClipboardCapture>,
}

pub(crate) fn load_pinned_clipboard_state(
    clipboard_cache_root: &Path,
) -> Result<PinnedClipboardState, String> {
    let path = pinned_clipboard_captures_file_path(clipboard_cache_root);
    if !path.exists() {
        return Ok(PinnedClipboardState::default());
    }

    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let mut state = serde_json::from_slice::<PinnedClipboardState>(&bytes)
        .map_err(|error| error.to_string())?;
    normalize_pinned_clipboard_state(&mut state);
    Ok(state)
}

pub(crate) fn persist_pinned_clipboard_state(
    clipboard_cache_root: &Path,
    state: &PinnedClipboardState,
) -> Result<(), String> {
    let mut normalized = state.clone();
    normalize_pinned_clipboard_state(&mut normalized);
    let path = pinned_clipboard_captures_file_path(clipboard_cache_root);
    write_json_file(&path, &normalized)
}

pub(crate) fn normalize_pinned_clipboard_state(state: &mut PinnedClipboardState) {
    for entry in &mut state.captures {
        entry.capture.id = entry.capture.id.trim().to_string();
        if entry.pinned_at.trim().is_empty() {
            entry.pinned_at = if entry.capture.captured_at.trim().is_empty() {
                now_rfc3339()
            } else {
                entry.capture.captured_at.clone()
            };
        }
    }

    state
        .captures
        .retain(|entry| !entry.capture.id.trim().is_empty());
    state.captures.sort_by(|left, right| {
        left.pinned_at
            .cmp(&right.pinned_at)
            .then_with(|| left.capture.id.cmp(&right.capture.id))
    });

    let mut seen_capture_ids = HashSet::new();
    state.captures = state
        .captures
        .drain(..)
        .rev()
        .filter(|entry| seen_capture_ids.insert(entry.capture.id.clone()))
        .collect();
    state.captures.reverse();

    if state.captures.len() > MAX_PINNED_CLIPBOARD_CAPTURES {
        let overflow = state.captures.len() - MAX_PINNED_CLIPBOARD_CAPTURES;
        state.captures.drain(0..overflow);
    }
}

pub(crate) fn load_pinned_clipboard_capture_ids(
    clipboard_cache_root: &Path,
) -> Result<HashSet<String>, String> {
    Ok(load_pinned_clipboard_state(clipboard_cache_root)?
        .captures
        .into_iter()
        .map(|entry| entry.capture.id)
        .collect())
}

pub(crate) fn remove_pinned_clipboard_capture(
    clipboard_cache_root: &Path,
    capture_id: &str,
) -> Result<bool, String> {
    let mut state = load_pinned_clipboard_state(clipboard_cache_root)?;
    let initial_len = state.captures.len();
    state
        .captures
        .retain(|entry| entry.capture.id != capture_id);

    if state.captures.len() == initial_len {
        return Ok(false);
    }

    persist_pinned_clipboard_state(clipboard_cache_root, &state)?;
    Ok(true)
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}

fn pinned_clipboard_captures_file_path(clipboard_cache_root: &Path) -> PathBuf {
    clipboard_cache_root.join(PINNED_CLIPBOARD_CAPTURES_FILE_NAME)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}
