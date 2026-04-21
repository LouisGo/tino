use std::{fs, path::Path};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    error::{AppError, AppResult},
    storage::knowledge_root::{
        ensure_knowledge_root_layout, topic_index_file_path, topics_dir_path,
    },
};

const TOPIC_INDEX_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TopicIndexEntry {
    pub topic_slug: String,
    pub topic_name: String,
    pub topic_summary: String,
    pub recent_tags: Vec<String>,
    pub last_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTopicIndexAsset {
    version: u8,
    updated_at: String,
    entries: Vec<TopicIndexEntry>,
}

pub fn load_topic_index_entries(knowledge_root: &Path) -> AppResult<Vec<TopicIndexEntry>> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    let asset_path = topic_index_file_path(knowledge_root);

    if !asset_path.exists() {
        return refresh_topic_index_asset(knowledge_root);
    }

    let bytes = fs::read(&asset_path)
        .map_err(|error| AppError::io("failed to read topic index asset", error))?;
    let asset = serde_json::from_slice::<PersistedTopicIndexAsset>(&bytes)
        .map_err(|error| AppError::json("failed to parse topic index asset", error))?;
    Ok(asset.entries)
}

pub fn refresh_topic_index_asset(knowledge_root: &Path) -> AppResult<Vec<TopicIndexEntry>> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    let entries = scan_topics_dir(knowledge_root)?;
    persist_topic_index_asset(knowledge_root, &entries)?;
    Ok(entries)
}

pub fn refresh_topic_index_entry(
    knowledge_root: &Path,
    topic_slug: &str,
) -> AppResult<Option<TopicIndexEntry>> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    let normalized_slug = topic_slug.trim();
    if normalized_slug.is_empty() {
        return Err(AppError::validation("topicSlug is required"));
    }

    let topic_path = topics_dir_path(knowledge_root).join(format!("{normalized_slug}.md"));
    let mut entries = load_topic_index_entries(knowledge_root)?;
    entries.retain(|entry| entry.topic_slug != normalized_slug);

    if !topic_path.exists() {
        persist_topic_index_asset(knowledge_root, &entries)?;
        return Ok(None);
    }

    let entry = scan_topic_file(&topic_path, normalized_slug)?;
    entries.push(entry.clone());
    entries.sort_by(|left, right| {
        right
            .last_updated_at
            .cmp(&left.last_updated_at)
            .then_with(|| left.topic_slug.cmp(&right.topic_slug))
    });
    persist_topic_index_asset(knowledge_root, &entries)?;
    Ok(Some(entry))
}

fn persist_topic_index_asset(knowledge_root: &Path, entries: &[TopicIndexEntry]) -> AppResult<()> {
    let asset = PersistedTopicIndexAsset {
        version: TOPIC_INDEX_SCHEMA_VERSION,
        updated_at: crate::format_system_time_rfc3339(std::time::SystemTime::now())?,
        entries: entries.to_vec(),
    };
    write_json_file(&topic_index_file_path(knowledge_root), &asset)
}

fn scan_topics_dir(knowledge_root: &Path) -> AppResult<Vec<TopicIndexEntry>> {
    let topics_dir = topics_dir_path(knowledge_root);
    if !topics_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&topics_dir)
        .map_err(|error| AppError::io("failed to read topics directory", error))?
    {
        let entry =
            entry.map_err(|error| AppError::io("failed to read topics directory entry", error))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let Some(topic_slug) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        entries.push(scan_topic_file(&path, topic_slug)?);
    }

    entries.sort_by(|left, right| {
        right
            .last_updated_at
            .cmp(&left.last_updated_at)
            .then_with(|| left.topic_slug.cmp(&right.topic_slug))
    });
    Ok(entries)
}

fn scan_topic_file(path: &Path, topic_slug: &str) -> AppResult<TopicIndexEntry> {
    let content = fs::read_to_string(path)
        .map_err(|error| AppError::io("failed to read topic markdown file", error))?;
    let metadata = path
        .metadata()
        .map_err(|error| AppError::io("failed to inspect topic markdown file", error))?;
    let last_updated_at = metadata
        .modified()
        .ok()
        .map(crate::format_system_time_rfc3339)
        .transpose()?
        .unwrap_or_default();

    Ok(TopicIndexEntry {
        topic_slug: topic_slug.to_string(),
        topic_name: parse_topic_name(&content).unwrap_or_else(|| topic_slug.replace('-', " ")),
        topic_summary: parse_topic_summary(&content)
            .unwrap_or_else(|| "Topic summary unavailable.".into()),
        recent_tags: parse_topic_recent_tags(&content),
        last_updated_at,
    })
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create topic index directory", error))?;
    }

    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::json("failed to serialize topic index asset", error))?;
    fs::write(path, bytes).map_err(|error| AppError::io("failed to write topic index asset", error))
}

fn parse_topic_name(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("# ")
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn parse_topic_summary(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            line.trim()
                .trim_start_matches("> Latest summary:")
                .trim_start_matches("Latest summary:")
                .trim()
                .to_string()
        })
        .filter(|value| !value.is_empty())
}

fn parse_topic_recent_tags(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("> Recent tags:")
                .or_else(|| line.strip_prefix("Recent tags:"))
        })
        .map(|line| {
            line.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "none")
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use super::{load_topic_index_entries, refresh_topic_index_entry};

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-topic-index-tests-{}",
            Uuid::now_v7().simple()
        ))
    }

    #[test]
    fn load_topic_index_entries_bootstraps_from_topics_directory() {
        let root = unique_root();
        let topics_dir = root.join("topics");
        fs::create_dir_all(&topics_dir).expect("topics dir should initialize");
        fs::write(
            topics_dir.join("rust.md"),
            "# Rust\n\n> Latest summary: Systems programming\n> Recent tags: rust, systems\n",
        )
        .expect("topic file should write");

        let entries = load_topic_index_entries(&root).expect("topic index should load");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].topic_slug, "rust");
        assert!(root.join("_system/topic-index.json").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refresh_topic_index_entry_updates_existing_asset() {
        let root = unique_root();
        let topics_dir = root.join("topics");
        fs::create_dir_all(&topics_dir).expect("topics dir should initialize");
        let topic_path = topics_dir.join("rust.md");
        fs::write(
            &topic_path,
            "# Rust\n\n> Latest summary: Systems programming\n> Recent tags: rust\n",
        )
        .expect("topic file should write");
        load_topic_index_entries(&root).expect("topic index should bootstrap");

        fs::write(
            &topic_path,
            "# Rust\n\n> Latest summary: Updated summary\n> Recent tags: rust, compiler\n",
        )
        .expect("topic file should update");

        let entry = refresh_topic_index_entry(&root, "rust")
            .expect("topic index refresh should work")
            .expect("topic should still exist");
        assert_eq!(entry.topic_summary, "Updated summary");
        assert_eq!(entry.recent_tags, vec!["rust", "compiler"]);

        let _ = fs::remove_dir_all(root);
    }
}
