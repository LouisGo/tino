use crate::app_state::{AppState, ClipboardSourceAppOption};
use log::info;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

#[cfg(target_os = "macos")]
use {
    objc2::AnyThread,
    objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace},
    objc2_core_foundation::{CFIndex, CFOptionFlags, CFRetained, CFString, CFType, CGPoint},
    objc2_foundation::{NSDictionary, NSRect, NSSize, NSString},
    plist::Value as PlistValue,
    sha2::{Digest, Sha256},
    std::{
        ffi::c_void,
        ptr::NonNull,
        sync::mpsc,
        time::{Duration, Instant},
    },
};

#[cfg(target_os = "macos")]
const CLIPBOARD_SOURCE_APP_SPOTLIGHT_QUERY: &str =
    "kMDItemContentTypeTree == 'com.apple.application-bundle' && kMDItemCFBundleIdentifier == '*'";
#[cfg(target_os = "macos")]
const MD_QUERY_SYNCHRONOUS: CFOptionFlags = 1;
#[cfg(target_os = "macos")]
const CLIPBOARD_SOURCE_APP_ICON_PIXEL_SIZE: f64 = 48.0;

#[cfg(target_os = "macos")]
#[link(name = "CoreServices", kind = "framework")]
unsafe extern "C-unwind" {
    static kMDItemCFBundleIdentifier: &'static CFString;
    static kMDItemDisplayName: &'static CFString;
    static kMDItemPath: &'static CFString;

    fn MDQueryCreate(
        allocator: *const c_void,
        query_string: Option<&CFString>,
        value_list_attrs: *const c_void,
        sorting_attrs: *const c_void,
    ) -> Option<NonNull<CFType>>;
    fn MDQueryExecute(query: &CFType, option_flags: CFOptionFlags) -> u8;
    fn MDQueryStop(query: &CFType);
    fn MDQueryGetResultCount(query: &CFType) -> CFIndex;
    fn MDQueryGetResultAtIndex(query: &CFType, idx: CFIndex) -> *const c_void;
    fn MDItemCopyAttribute(item: *const c_void, name: Option<&CFString>)
        -> Option<NonNull<CFType>>;
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSourceAppIconResult {
    pub app_path: String,
    pub icon_path: Option<String>,
}

pub(crate) async fn list_clipboard_source_apps(
    state: &AppState,
) -> Result<Vec<ClipboardSourceAppOption>, String> {
    if let Some(options) = state.cached_clipboard_source_apps()? {
        return Ok(options);
    }

    #[cfg(target_os = "macos")]
    {
        let start = Instant::now();
        let options = tauri::async_runtime::spawn_blocking(list_clipboard_source_apps_macos)
            .await
            .map_err(|error| error.to_string())??;
        state.cache_clipboard_source_apps(options.clone())?;
        info!(
            "loaded clipboard source app metadata: {} apps in {} ms",
            options.len(),
            start.elapsed().as_millis()
        );
        return Ok(options);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Clipboard source app listing is only supported on macOS".into())
    }
}

pub(crate) fn get_clipboard_source_app_icons(
    app: &AppHandle,
    state: &AppState,
    app_paths: Vec<String>,
) -> Result<Vec<ClipboardSourceAppIconResult>, String> {
    let mut deduped_paths = Vec::new();
    let mut seen_paths = HashSet::new();

    for app_path in app_paths {
        let trimmed = app_path.trim();
        if trimmed.is_empty() || !seen_paths.insert(trimmed.to_string()) {
            continue;
        }

        deduped_paths.push(trimmed.to_string());
    }

    let (cached_entries, missing_paths) =
        state.split_cached_clipboard_source_app_icons(&deduped_paths)?;
    let mut results = cached_entries
        .into_iter()
        .map(|(app_path, icon_path)| ClipboardSourceAppIconResult {
            app_path,
            icon_path,
        })
        .collect::<Vec<_>>();

    #[cfg(target_os = "macos")]
    {
        let mut disk_cached_entries = Vec::new();
        let mut unresolved_paths = Vec::new();

        for app_path in missing_paths {
            if let Some(icon_path) = cached_clipboard_source_app_icon_path(state, &app_path) {
                disk_cached_entries.push((app_path.clone(), Some(icon_path.clone())));
                results.push(ClipboardSourceAppIconResult {
                    app_path,
                    icon_path: Some(icon_path),
                });
            } else {
                unresolved_paths.push(app_path);
            }
        }

        if !disk_cached_entries.is_empty() {
            state.cache_clipboard_source_app_icons(disk_cached_entries)?;
        }

        if !unresolved_paths.is_empty() {
            let start = Instant::now();
            let resolved_icons =
                load_clipboard_source_app_icons_macos(app, state, &unresolved_paths)?;
            state.cache_clipboard_source_app_icons(
                resolved_icons
                    .iter()
                    .map(|entry| (entry.app_path.clone(), entry.icon_path.clone()))
                    .collect(),
            )?;
            info!(
                "loaded clipboard source app icons: {} app(s) in {} ms",
                resolved_icons.len(),
                start.elapsed().as_millis()
            );
            results.extend(resolved_icons);
        }

        return Ok(results);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = missing_paths;
        Ok(results)
    }
}

#[cfg(target_os = "macos")]
fn list_clipboard_source_apps_macos() -> Result<Vec<ClipboardSourceAppOption>, String> {
    let mut options_by_bundle = std::collections::HashMap::new();

    for option in indexed_clipboard_source_app_options()?
        .into_iter()
        .chain(running_clipboard_source_app_options())
    {
        let dedupe_key = option.bundle_id.trim().to_ascii_lowercase();
        if dedupe_key.is_empty() {
            continue;
        }

        match options_by_bundle.entry(dedupe_key) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(option);
            }
            std::collections::hash_map::Entry::Occupied(mut entry) => {
                if clipboard_source_app_option_preference(&option)
                    > clipboard_source_app_option_preference(entry.get())
                {
                    entry.insert(option);
                }
            }
        }
    }

    let mut options = options_by_bundle.into_values().collect::<Vec<_>>();
    options.sort_by(|left, right| {
        left.app_name
            .to_lowercase()
            .cmp(&right.app_name.to_lowercase())
            .then_with(|| left.bundle_id.cmp(&right.bundle_id))
    });

    Ok(options)
}

#[cfg(target_os = "macos")]
fn indexed_clipboard_source_app_options() -> Result<Vec<ClipboardSourceAppOption>, String> {
    let query_string = CFString::from_str(CLIPBOARD_SOURCE_APP_SPOTLIGHT_QUERY);
    let Some(query_ptr) = (unsafe {
        MDQueryCreate(
            std::ptr::null(),
            Some(&query_string),
            std::ptr::null(),
            std::ptr::null(),
        )
    }) else {
        return Err("failed to create macOS Spotlight metadata query".into());
    };
    let query = unsafe { CFRetained::<CFType>::from_raw(query_ptr) };

    if unsafe { MDQueryExecute(query.as_ref(), MD_QUERY_SYNCHRONOUS) } == 0 {
        return Err("failed to execute macOS Spotlight metadata query".into());
    }

    let result_count = unsafe { MDQueryGetResultCount(query.as_ref()) }.max(0) as usize;
    let mut options = Vec::with_capacity(result_count);

    for index in 0..result_count {
        let item = unsafe { MDQueryGetResultAtIndex(query.as_ref(), index as CFIndex) };
        if item.is_null() {
            continue;
        }

        if let Some(option) = read_indexed_clipboard_source_app_option(item) {
            options.push(option);
        }
    }

    unsafe {
        MDQueryStop(query.as_ref());
    }

    Ok(options)
}

#[cfg(target_os = "macos")]
fn read_indexed_clipboard_source_app_option(
    item: *const c_void,
) -> Option<ClipboardSourceAppOption> {
    let bundle_id = copy_md_item_string_attribute(item, unsafe { kMDItemCFBundleIdentifier })?;
    let app_path = copy_md_item_string_attribute(item, unsafe { kMDItemPath })?;
    if !is_user_visible_clipboard_source_app_path(Path::new(&app_path)) {
        return None;
    }

    let fallback_name = Path::new(&app_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&bundle_id)
        .to_string();
    let app_name =
        copy_md_item_string_attribute(item, unsafe { kMDItemDisplayName }).unwrap_or(fallback_name);

    Some(ClipboardSourceAppOption {
        bundle_id,
        app_name,
        app_path: Some(app_path),
        icon_path: None,
    })
}

#[cfg(target_os = "macos")]
fn copy_md_item_string_attribute(item: *const c_void, name: &'static CFString) -> Option<String> {
    let value = unsafe { MDItemCopyAttribute(item, Some(name)) }?;
    let value = unsafe { CFRetained::<CFType>::from_raw(value) };
    let string = value.downcast::<CFString>().ok()?;
    let text = string.to_string();
    let trimmed = text.trim();

    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[cfg(target_os = "macos")]
fn is_user_visible_clipboard_source_app_path(app_path: &Path) -> bool {
    let app_path_string = app_path.to_string_lossy();

    if !app_path_string.ends_with(".app") || app_path_string.contains(".app/Contents/") {
        return false;
    }

    let allowed_root = if app_path_string.starts_with("/Applications/")
        || app_path_string.starts_with("/System/Applications/")
        || app_path_string.starts_with("/System/Library/CoreServices/Applications/")
        || app_path_string == "/System/Library/CoreServices/Finder.app"
    {
        true
    } else {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|path| path.join("Applications"))
            .and_then(|path| path.to_str().map(ToOwned::to_owned))
            .is_some_and(|prefix| app_path_string.starts_with(&format!("{prefix}/")))
    };

    if !allowed_root {
        return false;
    }

    !bundle_runs_without_dock_presence(app_path)
}

#[cfg(target_os = "macos")]
fn bundle_runs_without_dock_presence(app_path: &Path) -> bool {
    let info_plist_path = app_path.join("Contents/Info.plist");
    let Ok(info_plist) = PlistValue::from_file(&info_plist_path) else {
        return false;
    };
    let Some(info_dictionary) = info_plist.as_dictionary() else {
        return false;
    };

    plist_bool(info_dictionary.get("LSUIElement")).unwrap_or(false)
        || plist_bool(info_dictionary.get("LSBackgroundOnly")).unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn plist_bool(value: Option<&PlistValue>) -> Option<bool> {
    match value {
        Some(PlistValue::Boolean(flag)) => Some(*flag),
        Some(PlistValue::String(text)) => match text.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Some(true),
            "0" | "false" | "no" => Some(false),
            _ => None,
        },
        Some(PlistValue::Integer(number)) => number.as_signed().map(|value| value != 0),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn clipboard_source_app_option_preference(option: &ClipboardSourceAppOption) -> (u8, u8) {
    let path_rank = option
        .app_path
        .as_deref()
        .map(clipboard_source_app_path_rank)
        .unwrap_or(0);
    let has_friendly_name = u8::from(
        !option
            .app_name
            .trim()
            .eq_ignore_ascii_case(&option.bundle_id),
    );

    (path_rank, has_friendly_name)
}

#[cfg(target_os = "macos")]
fn clipboard_source_app_path_rank(app_path: &str) -> u8 {
    if app_path.starts_with("/Applications/") {
        return 4;
    }
    if app_path.starts_with("/System/Applications/") {
        return 3;
    }
    if app_path.starts_with("/System/Library/CoreServices/Applications/") {
        return 2;
    }
    if !app_path.is_empty() {
        return 1;
    }

    0
}

#[cfg(target_os = "macos")]
fn running_clipboard_source_app_options() -> Vec<ClipboardSourceAppOption> {
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .filter_map(|application| {
            if application.activationPolicy()
                != objc2_app_kit::NSApplicationActivationPolicy::Regular
            {
                return None;
            }

            let bundle_id = application
                .bundleIdentifier()
                .map(|value| value.to_string())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())?;
            let app_path = application
                .bundleURL()
                .and_then(|value| value.path())
                .map(|value| value.to_string())
                .filter(|value| is_user_visible_clipboard_source_app_path(Path::new(value)));
            let app_name = application
                .localizedName()
                .map(|value| value.to_string())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| bundle_id.clone());

            Some(ClipboardSourceAppOption {
                bundle_id,
                app_name,
                app_path,
                icon_path: None,
            })
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn cached_clipboard_source_app_icon_path(state: &AppState, app_path: &str) -> Option<String> {
    let cache_path = clipboard_source_app_icon_cache_path(state, app_path);

    cache_path
        .exists()
        .then(|| cache_path.display().to_string())
}

#[cfg(target_os = "macos")]
fn clipboard_source_app_icon_cache_path(state: &AppState, app_path: &str) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(app_path.trim().as_bytes());
    let cache_key = format!("{:x}", hasher.finalize());

    state
        .clipboard_source_app_icons_dir()
        .join(format!("{cache_key}.png"))
}

#[cfg(target_os = "macos")]
fn load_clipboard_source_app_icons_macos(
    app: &AppHandle,
    state: &AppState,
    app_paths: &[String],
) -> Result<Vec<ClipboardSourceAppIconResult>, String> {
    let requests = app_paths
        .iter()
        .filter_map(|app_path| {
            let trimmed = app_path.trim();
            (!trimmed.is_empty()).then(|| ClipboardSourceAppIconLoadRequest {
                app_path: trimmed.to_string(),
                icon_cache_path: clipboard_source_app_icon_cache_path(state, trimmed),
            })
        })
        .collect::<Vec<_>>();
    let (sender, receiver) = mpsc::sync_channel(1);

    app.run_on_main_thread(move || {
        let icons = requests
            .into_iter()
            .map(|request| ClipboardSourceAppIconResult {
                icon_path: match persist_clipboard_source_app_icon(&request) {
                    Ok(icon_path) => icon_path,
                    Err(error) => {
                        log::warn!(
                            "failed to load clipboard source app icon for {}: {}",
                            request.app_path,
                            error
                        );
                        None
                    }
                },
                app_path: request.app_path,
            })
            .collect::<Vec<_>>();
        let _ = sender.send(icons);
    })
    .map_err(|error| error.to_string())?;

    receiver
        .recv_timeout(Duration::from_secs(10))
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
struct ClipboardSourceAppIconLoadRequest {
    app_path: String,
    icon_cache_path: PathBuf,
}

#[cfg(target_os = "macos")]
fn persist_clipboard_source_app_icon(
    request: &ClipboardSourceAppIconLoadRequest,
) -> Result<Option<String>, String> {
    if request.icon_cache_path.exists() {
        return Ok(Some(request.icon_cache_path.display().to_string()));
    }

    let icon_bytes = app_icon_png_bytes_for_path(Path::new(&request.app_path))
        .ok_or_else(|| "macOS did not return an icon".to_string())?;
    let Some(parent_dir) = request.icon_cache_path.parent() else {
        return Err("invalid icon cache path".into());
    };

    fs::create_dir_all(parent_dir).map_err(|error| error.to_string())?;
    fs::write(&request.icon_cache_path, icon_bytes).map_err(|error| error.to_string())?;

    Ok(Some(request.icon_cache_path.display().to_string()))
}

#[cfg(target_os = "macos")]
fn app_icon_png_bytes_for_path(app_path: &Path) -> Option<Vec<u8>> {
    let workspace = NSWorkspace::sharedWorkspace();
    let path = NSString::from_str(&app_path.display().to_string());
    let icon = workspace.iconForFile(&path);
    ns_image_to_png_bytes(&icon)
}

#[cfg(target_os = "macos")]
fn ns_image_to_png_bytes(image: &objc2_app_kit::NSImage) -> Option<Vec<u8>> {
    image.setSize(NSSize::new(
        CLIPBOARD_SOURCE_APP_ICON_PIXEL_SIZE,
        CLIPBOARD_SOURCE_APP_ICON_PIXEL_SIZE,
    ));
    let mut proposed_rect = NSRect::new(
        CGPoint::new(0.0, 0.0),
        NSSize::new(
            CLIPBOARD_SOURCE_APP_ICON_PIXEL_SIZE,
            CLIPBOARD_SOURCE_APP_ICON_PIXEL_SIZE,
        ),
    );
    let cg_image =
        unsafe { image.CGImageForProposedRect_context_hints(&mut proposed_rect, None, None) }?;
    let bitmap_rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg_image);
    let properties = NSDictionary::new();
    unsafe {
        bitmap_rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
    }
    .map(|data| data.to_vec())
}
