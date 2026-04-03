use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePreview {
  id: String,
  source: String,
  content_kind: String,
  preview: String,
  captured_at: String,
  status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
  app_name: String,
  app_version: String,
  build_channel: String,
  os: String,
  default_knowledge_root: String,
  app_data_dir: String,
  queue_policy: String,
  capture_mode: String,
  recent_captures: Vec<CapturePreview>,
}

#[tauri::command]
pub fn get_dashboard_snapshot(app: AppHandle) -> Result<DashboardSnapshot, String> {
  let home_dir = app
    .path()
    .home_dir()
    .map_err(|error| error.to_string())?
    .display()
    .to_string();

  let app_data_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?
    .display()
    .to_string();

  Ok(DashboardSnapshot {
    app_name: app.package_info().name.clone(),
    app_version: app.package_info().version.to_string(),
    build_channel: if cfg!(debug_assertions) {
      "debug".into()
    } else {
      "release".into()
    },
    os: std::env::consts::OS.into(),
    default_knowledge_root: format!("{home_dir}/tino-inbox"),
    app_data_dir,
    queue_policy: "20 captures or 10 minutes".into(),
    capture_mode: "silent capture + batch AI".into(),
    recent_captures: vec![
      CapturePreview {
        id: "cap_001".into(),
        source: "clipboard".into(),
        content_kind: "plain_text".into(),
        preview: "Tauri tray shell bootstrap and Rust runtime ownership".into(),
        captured_at: "2026-04-04T10:30:00+08:00".into(),
        status: "queued".into(),
      },
      CapturePreview {
        id: "cap_002".into(),
        source: "clipboard".into(),
        content_kind: "rich_text".into(),
        preview: "AI SDK provider config draft persisted on the frontend side".into(),
        captured_at: "2026-04-04T09:55:00+08:00".into(),
        status: "archived".into(),
      },
      CapturePreview {
        id: "cap_003".into(),
        source: "clipboard".into(),
        content_kind: "plain_text".into(),
        preview: "Potential token-like value filtered by the minimum safety guard".into(),
        captured_at: "2026-04-04T09:42:00+08:00".into(),
        status: "filtered".into(),
      },
    ],
  })
}
