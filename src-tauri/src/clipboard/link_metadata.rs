use std::{
    fs,
    io::Read,
    net::IpAddr,
    path::{Path, PathBuf},
};

use chrono::Local;
use reqwest::{
    blocking::{Client, Response},
    header::{CONTENT_LENGTH, CONTENT_TYPE, LOCATION, USER_AGENT},
    StatusCode,
};
use scraper::{Html, Selector};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::{Host, Url};

use crate::clipboard::types::{LinkMetadata, LinkMetadataFetchStatus};

const LINK_METADATA_ICON_DIR_NAME: &str = "link-icons";
const LINK_METADATA_USER_AGENT: &str =
    "Mozilla/5.0 (compatible; TinoClipboardLinkPreview/0.1; +https://tino.local)";
const LINK_METADATA_MAX_REDIRECTS: usize = 4;
const LINK_METADATA_HTML_READ_LIMIT_BYTES: usize = 256 * 1024;
const LINK_METADATA_MANIFEST_READ_LIMIT_BYTES: usize = 128 * 1024;
const LINK_METADATA_ICON_READ_LIMIT_BYTES: usize = 512 * 1024;
const LINK_METADATA_REQUEST_TIMEOUT_SECS: u64 = 4;
const LINK_METADATA_CONNECT_TIMEOUT_SECS: u64 = 2;
const LINK_METADATA_TITLE_MAX_CHARS: usize = 140;
const LINK_METADATA_DESCRIPTION_MAX_CHARS: usize = 220;
const LINK_METADATA_PREFERRED_ICON_EDGE_PX: i32 = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum IconCandidateKind {
    HtmlIcon,
    ManifestIcon,
    DefaultFavicon,
    AppleTouchIcon,
    FluidIcon,
}

impl IconCandidateKind {
    fn priority(self) -> i32 {
        match self {
            Self::HtmlIcon => 500,
            Self::ManifestIcon => 430,
            Self::DefaultFavicon => 400,
            Self::AppleTouchIcon => 320,
            Self::FluidIcon => 260,
        }
    }
}

#[derive(Debug, Clone)]
struct IconCandidate {
    url: Url,
    kind: IconCandidateKind,
    max_edge: Option<i32>,
    scalable: bool,
    mime_type: Option<String>,
    priority_adjustment: i32,
}

impl IconCandidate {
    fn score(&self) -> i32 {
        self.kind.priority()
            + self.priority_adjustment
            + preferred_icon_size_bonus(self.max_edge, self.scalable)
            + icon_format_bonus(self.mime_type.as_deref(), &self.url)
            + icon_path_bonus(&self.url)
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct IconSizeHint {
    max_edge: Option<i32>,
    scalable: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct WebManifest {
    icons: Vec<WebManifestIcon>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct WebManifestIcon {
    src: String,
    sizes: Option<String>,
    purpose: Option<String>,
    #[serde(rename = "type")]
    mime_type: Option<String>,
}

pub(crate) fn fetch_link_metadata(link_url: &str, clipboard_cache_root: &Path) -> LinkMetadata {
    let fetched_at = now_rfc3339();
    let Some(initial_url) = normalized_fetchable_link_url(link_url) else {
        return skipped_link_metadata(&fetched_at);
    };

    let client = match Client::builder()
        .connect_timeout(std::time::Duration::from_secs(
            LINK_METADATA_CONNECT_TIMEOUT_SECS,
        ))
        .timeout(std::time::Duration::from_secs(
            LINK_METADATA_REQUEST_TIMEOUT_SECS,
        ))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => return failed_link_metadata(&fetched_at),
    };

    let mut title = None;
    let mut description = None;
    let mut final_url = initial_url.clone();
    let mut icon_candidates = Vec::new();

    if let Ok((mut response, resolved_url)) = send_following_redirects(&client, initial_url) {
        final_url = resolved_url;

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());
        let html = if response.status().is_success()
            && looks_like_html_response(&response, content_type.as_deref())
        {
            read_limited_response_text(&mut response, LINK_METADATA_HTML_READ_LIMIT_BYTES)
        } else {
            None
        };

        if let Some(html) = html.as_deref() {
            let document = Html::parse_document(html);
            title = extract_link_title(&document);
            description = extract_link_description(&document);
            icon_candidates.extend(extract_icon_candidates(&document, &final_url));

            if let Some(manifest_url) = extract_manifest_url(&document, &final_url) {
                icon_candidates.extend(fetch_manifest_icon_candidates(&client, &manifest_url));
            }
        }
    }

    icon_candidates.extend(default_icon_candidates(&final_url));

    let icon_path = fetch_best_icon_to_cache(&client, icon_candidates, clipboard_cache_root);

    let title = normalize_link_text(title.as_deref(), LINK_METADATA_TITLE_MAX_CHARS);
    let description =
        normalize_link_text(description.as_deref(), LINK_METADATA_DESCRIPTION_MAX_CHARS);

    if title.is_some() || description.is_some() || icon_path.is_some() {
        LinkMetadata {
            title,
            description,
            icon_path,
            fetched_at,
            fetch_status: LinkMetadataFetchStatus::Ready,
        }
    } else {
        failed_link_metadata(&fetched_at)
    }
}

pub(crate) fn link_metadata_icon_dir_path(clipboard_cache_root: &Path) -> PathBuf {
    clipboard_cache_root.join(LINK_METADATA_ICON_DIR_NAME)
}

fn send_following_redirects(
    client: &Client,
    mut current_url: Url,
) -> Result<(Response, Url), String> {
    for _ in 0..=LINK_METADATA_MAX_REDIRECTS {
        if !is_fetchable_remote_url(&current_url) {
            return Err("redirect target is not fetchable".into());
        }

        let response = client
            .get(current_url.clone())
            .header(USER_AGENT, LINK_METADATA_USER_AGENT)
            .send()
            .map_err(|error| error.to_string())?;

        if !response.status().is_redirection() {
            return Ok((response, current_url));
        }

        let Some(location) = response.headers().get(LOCATION) else {
            return Err("redirect response missing location".into());
        };
        let location = location.to_str().map_err(|error| error.to_string())?;
        current_url = current_url
            .join(location)
            .map_err(|error| error.to_string())?;
    }

    Err("too many redirects".into())
}

fn looks_like_html_response(response: &Response, content_type: Option<&str>) -> bool {
    if let Some(content_type) = content_type {
        let normalized = content_type.trim().to_ascii_lowercase();
        if normalized.contains("text/html") || normalized.contains("application/xhtml+xml") {
            return true;
        }
        if normalized.starts_with("image/") {
            return false;
        }
    }

    if let Some(content_length) = response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    {
        return content_length <= LINK_METADATA_HTML_READ_LIMIT_BYTES as u64;
    }

    true
}

fn read_limited_response_text(response: &mut Response, byte_limit: usize) -> Option<String> {
    let mut buffer = Vec::new();
    let mut reader = response.take((byte_limit + 1) as u64);
    reader.read_to_end(&mut buffer).ok()?;
    if buffer.is_empty() {
        return None;
    }
    if buffer.len() > byte_limit {
        buffer.truncate(byte_limit);
    }
    Some(String::from_utf8_lossy(&buffer).into_owned())
}

fn extract_link_title(document: &Html) -> Option<String> {
    extract_meta_content(document, "meta[property=\"og:title\"]")
        .or_else(|| extract_meta_content(document, "meta[name=\"twitter:title\"]"))
        .or_else(|| {
            let selector = Selector::parse("title").ok()?;
            document
                .select(&selector)
                .next()
                .map(|element| element.text().collect::<String>())
        })
}

fn extract_link_description(document: &Html) -> Option<String> {
    extract_meta_content(document, "meta[property=\"og:description\"]")
        .or_else(|| extract_meta_content(document, "meta[name=\"description\"]"))
        .or_else(|| extract_meta_content(document, "meta[name=\"twitter:description\"]"))
}

fn extract_meta_content(document: &Html, selector: &str) -> Option<String> {
    let selector = Selector::parse(selector).ok()?;
    document
        .select(&selector)
        .filter_map(|element| element.value().attr("content"))
        .map(str::trim)
        .find(|content| !content.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_icon_candidates(document: &Html, page_url: &Url) -> Vec<IconCandidate> {
    let base_url = document_base_url(document, page_url).unwrap_or_else(|| page_url.clone());
    let Some(selector) = Selector::parse("link[rel][href]").ok() else {
        return Vec::new();
    };

    let mut candidates = document
        .select(&selector)
        .filter_map(|element| {
            let rel = element.value().attr("rel")?.trim().to_ascii_lowercase();
            let kind = classify_html_icon_rel(&rel)?;

            let href = element.value().attr("href")?.trim();
            if href.is_empty() || href.starts_with("data:") {
                return None;
            }

            let size_hint = parse_icon_size_hint(element.value().attr("sizes"));
            let mime_type = element
                .value()
                .attr("type")
                .map(str::trim)
                .and_then(|value| (!value.is_empty()).then(|| value.to_ascii_lowercase()));

            base_url.join(href).ok().map(|url| IconCandidate {
                url,
                kind,
                max_edge: size_hint.max_edge,
                scalable: size_hint.scalable,
                mime_type,
                priority_adjustment: 0,
            })
        })
        .filter(|candidate| is_fetchable_remote_url(&candidate.url))
        .collect::<Vec<_>>();

    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.score()));
    candidates
}

fn document_base_url(document: &Html, page_url: &Url) -> Option<Url> {
    let selector = Selector::parse("base[href]").ok()?;
    let href = document
        .select(&selector)
        .next()?
        .value()
        .attr("href")?
        .trim();
    if href.is_empty() {
        return None;
    }
    page_url.join(href).ok()
}

fn extract_manifest_url(document: &Html, page_url: &Url) -> Option<Url> {
    let base_url = document_base_url(document, page_url).unwrap_or_else(|| page_url.clone());
    let selector = Selector::parse("link[rel][href]").ok()?;

    document.select(&selector).find_map(|element| {
        let rel = element.value().attr("rel")?.trim().to_ascii_lowercase();
        if !rel.split_whitespace().any(|token| token == "manifest") {
            return None;
        }

        let href = element.value().attr("href")?.trim();
        if href.is_empty() || href.starts_with("data:") {
            return None;
        }

        let url = base_url.join(href).ok()?;
        is_fetchable_remote_url(&url).then_some(url)
    })
}

fn fetch_manifest_icon_candidates(client: &Client, manifest_url: &Url) -> Vec<IconCandidate> {
    let Ok((mut response, final_manifest_url)) =
        send_following_redirects(client, manifest_url.clone())
    else {
        return Vec::new();
    };
    if !response.status().is_success() {
        return Vec::new();
    }

    let manifest_text =
        read_limited_response_text(&mut response, LINK_METADATA_MANIFEST_READ_LIMIT_BYTES);
    let Some(manifest) =
        manifest_text.and_then(|text| serde_json::from_str::<WebManifest>(&text).ok())
    else {
        return Vec::new();
    };

    let mut candidates = manifest
        .icons
        .into_iter()
        .filter_map(|icon| {
            let src = icon.src.trim();
            if src.is_empty() || src.starts_with("data:") {
                return None;
            }

            let url = final_manifest_url.join(src).ok()?;
            if !is_fetchable_remote_url(&url) {
                return None;
            }

            let size_hint = parse_icon_size_hint(icon.sizes.as_deref());
            let purpose_penalty = icon
                .purpose
                .as_deref()
                .map(manifest_purpose_penalty)
                .unwrap_or(0);

            Some(IconCandidate {
                url,
                kind: IconCandidateKind::ManifestIcon,
                max_edge: size_hint.max_edge,
                scalable: size_hint.scalable,
                mime_type: icon.mime_type.map(|value| value.to_ascii_lowercase()),
                priority_adjustment: -purpose_penalty,
            })
        })
        .collect::<Vec<_>>();

    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.score()));
    candidates
}

fn parse_icon_size_hint(value: Option<&str>) -> IconSizeHint {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return IconSizeHint::default();
    };

    let normalized = value.to_ascii_lowercase();
    let scalable = normalized
        .split_whitespace()
        .any(|part| part.eq_ignore_ascii_case("any"));
    let max_edge = normalized
        .split_whitespace()
        .filter_map(|part| {
            let (width, height) = part.split_once('x')?;
            let width = width.parse::<i32>().ok()?;
            let height = height.parse::<i32>().ok()?;
            Some(width.max(height))
        })
        .max();

    IconSizeHint { max_edge, scalable }
}

fn classify_html_icon_rel(rel: &str) -> Option<IconCandidateKind> {
    let normalized = rel.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }

    if normalized.contains("mask-icon") {
        return None;
    }

    if normalized.contains("apple-touch-icon") {
        return Some(IconCandidateKind::AppleTouchIcon);
    }

    if normalized.contains("fluid-icon") {
        return Some(IconCandidateKind::FluidIcon);
    }

    normalized
        .contains("icon")
        .then_some(IconCandidateKind::HtmlIcon)
}

fn manifest_purpose_penalty(value: &str) -> i32 {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized.contains("any") {
        0
    } else if normalized.contains("maskable") {
        24
    } else {
        12
    }
}

fn default_icon_candidates(page_url: &Url) -> Vec<IconCandidate> {
    let default_paths = ["/favicon.ico", "/favicon.svg", "/favicon.png"];

    default_paths
        .into_iter()
        .filter_map(|path| {
            let mut icon_url = page_url.clone();
            icon_url.set_path(path);
            icon_url.set_query(None);
            icon_url.set_fragment(None);

            is_fetchable_remote_url(&icon_url).then_some(IconCandidate {
                url: icon_url,
                kind: IconCandidateKind::DefaultFavicon,
                max_edge: None,
                scalable: path.ends_with(".svg"),
                mime_type: None,
                priority_adjustment: 0,
            })
        })
        .collect()
}

fn fetch_best_icon_to_cache(
    client: &Client,
    candidates: Vec<IconCandidate>,
    clipboard_cache_root: &Path,
) -> Option<String> {
    let mut candidates = dedupe_icon_candidates(candidates);
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.score()));

    for candidate in candidates {
        if let Ok(Some(icon_path)) =
            fetch_icon_to_cache(client, &candidate.url, clipboard_cache_root)
        {
            return Some(icon_path);
        }
    }

    None
}

fn dedupe_icon_candidates(candidates: Vec<IconCandidate>) -> Vec<IconCandidate> {
    let mut deduped = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    for candidate in candidates {
        if seen_urls.insert(candidate.url.to_string()) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn fetch_icon_to_cache(
    client: &Client,
    icon_url: &Url,
    clipboard_cache_root: &Path,
) -> Result<Option<String>, String> {
    if !is_fetchable_remote_url(icon_url) {
        return Ok(None);
    }

    let (response, final_url) = send_following_redirects(client, icon_url.clone())?;
    if response.status() == StatusCode::NOT_FOUND || !response.status().is_success() {
        return Ok(None);
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let mut bytes = Vec::new();
    let mut reader = response.take((LINK_METADATA_ICON_READ_LIMIT_BYTES + 1) as u64);
    reader
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.is_empty() || bytes.len() > LINK_METADATA_ICON_READ_LIMIT_BYTES {
        return Ok(None);
    }

    let Some(extension) = infer_icon_extension(content_type.as_deref(), &final_url, &bytes) else {
        return Ok(None);
    };

    let cache_key = hash_url(final_url.as_str());
    let icon_path =
        link_metadata_icon_dir_path(clipboard_cache_root).join(format!("{cache_key}.{extension}"));
    if !icon_path.exists() {
        if let Some(parent) = icon_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&icon_path, bytes).map_err(|error| error.to_string())?;
    }

    Ok(Some(icon_path.display().to_string()))
}

fn infer_icon_extension(
    content_type: Option<&str>,
    final_url: &Url,
    bytes: &[u8],
) -> Option<&'static str> {
    if let Some(content_type) = content_type {
        let normalized = content_type
            .split(';')
            .next()
            .unwrap_or(content_type)
            .trim()
            .to_ascii_lowercase();
        match normalized.as_str() {
            "image/png" => return Some("png"),
            "image/svg+xml" => return Some("svg"),
            "image/jpeg" => return Some("jpg"),
            "image/gif" => return Some("gif"),
            "image/webp" => return Some("webp"),
            "image/x-icon" | "image/vnd.microsoft.icon" | "image/ico" => return Some("ico"),
            value if value.contains("html") || value.starts_with("text/") => {
                return sniff_icon_extension(bytes);
            }
            _ => {}
        }
    }

    if looks_like_html_bytes(bytes) {
        return None;
    }

    sniff_icon_extension(bytes).or_else(|| infer_icon_extension_from_url(final_url))
}

fn infer_icon_extension_from_url(final_url: &Url) -> Option<&'static str> {
    let path = final_url.path().to_ascii_lowercase();
    if path.ends_with(".png") {
        Some("png")
    } else if path.ends_with(".svg") {
        Some("svg")
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        Some("jpg")
    } else if path.ends_with(".gif") {
        Some("gif")
    } else if path.ends_with(".webp") {
        Some("webp")
    } else if path.ends_with(".ico") {
        Some("ico")
    } else {
        None
    }
}

fn sniff_icon_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }

    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) || bytes.starts_with(&[0x00, 0x00, 0x02, 0x00])
    {
        return Some("ico");
    }

    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }

    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("jpg");
    }

    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }

    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    if prefix.contains("<svg") {
        return Some("svg");
    }

    None
}

fn looks_like_html_bytes(bytes: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    prefix.contains("<html") || prefix.contains("<!doctype html") || prefix.contains("<body")
}

fn preferred_icon_size_bonus(max_edge: Option<i32>, scalable: bool) -> i32 {
    if scalable {
        return 90;
    }

    let Some(max_edge) = max_edge.filter(|edge| *edge > 0) else {
        return 45;
    };

    let distance = (max_edge - LINK_METADATA_PREFERRED_ICON_EDGE_PX)
        .abs()
        .min(96);
    let closeness_bonus = 80 - distance;
    let oversized_penalty = if max_edge > 96 {
        ((max_edge - 96) / 4).min(40)
    } else {
        0
    };

    closeness_bonus - oversized_penalty
}

fn icon_format_bonus(mime_type: Option<&str>, url: &Url) -> i32 {
    if let Some(mime_type) = mime_type {
        let normalized = mime_type
            .split(';')
            .next()
            .unwrap_or(mime_type)
            .trim()
            .to_ascii_lowercase();
        match normalized.as_str() {
            "image/x-icon" | "image/vnd.microsoft.icon" | "image/ico" => return 18,
            "image/svg+xml" => return 16,
            "image/png" => return 12,
            _ => {}
        }
    }

    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".ico") {
        18
    } else if path.ends_with(".svg") {
        16
    } else if path.ends_with(".png") {
        12
    } else {
        0
    }
}

fn icon_path_bonus(url: &Url) -> i32 {
    let path = url.path().to_ascii_lowercase();
    if path.ends_with("/favicon.ico") {
        20
    } else if path.contains("favicon") {
        10
    } else {
        0
    }
}

fn hash_url(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalized_fetchable_link_url(link_url: &str) -> Option<Url> {
    let url = Url::parse(link_url.trim()).ok()?;
    is_fetchable_remote_url(&url).then_some(url)
}

fn is_fetchable_remote_url(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    if !url.username().trim().is_empty() || url.password().is_some() {
        return false;
    }

    match url.host() {
        Some(Host::Domain(domain)) => {
            let domain = domain.trim().trim_end_matches('.').to_ascii_lowercase();
            if domain.is_empty() {
                return false;
            }

            !matches!(
                domain.as_str(),
                "localhost" | "localhost.localdomain" | "home.arpa"
            ) && !domain.ends_with(".localhost")
                && !domain.ends_with(".local")
                && !domain.ends_with(".internal")
        }
        Some(Host::Ipv4(ip)) => is_public_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => is_public_ip(IpAddr::V6(ip)),
        None => false,
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_multicast()
                && !ip.is_unspecified()
                && !(octets[0] == 100 && (64..=127).contains(&octets[1]))
                && !(octets[0] == 198 && octets[1] == 18)
                && !(octets[0] == 198 && octets[1] == 19)
        }
        IpAddr::V6(ip) => {
            !ip.is_loopback()
                && !ip.is_multicast()
                && !ip.is_unspecified()
                && !ip.is_unique_local()
                && !ip.is_unicast_link_local()
        }
    }
}

fn normalize_link_text(value: Option<&str>, max_chars: usize) -> Option<String> {
    let normalized = value?.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut result = trimmed.chars().take(max_chars).collect::<String>();
    if trimmed.chars().count() > max_chars {
        result.push('…');
    }
    Some(result)
}

fn skipped_link_metadata(fetched_at: &str) -> LinkMetadata {
    LinkMetadata {
        title: None,
        description: None,
        icon_path: None,
        fetched_at: fetched_at.to_string(),
        fetch_status: LinkMetadataFetchStatus::Skipped,
    }
}

fn failed_link_metadata(fetched_at: &str) -> LinkMetadata {
    LinkMetadata {
        title: None,
        description: None,
        icon_path: None,
        fetched_at: fetched_at.to_string(),
        fetch_status: LinkMetadataFetchStatus::Failed,
    }
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_private_or_sensitive_hosts() {
        assert!(!is_fetchable_remote_url(
            &Url::parse("http://localhost:3000").expect("localhost url should parse"),
        ));
        assert!(!is_fetchable_remote_url(
            &Url::parse("https://127.0.0.1/dashboard").expect("loopback url should parse"),
        ));
        assert!(!is_fetchable_remote_url(
            &Url::parse("https://192.168.1.2").expect("private ipv4 should parse"),
        ));
        assert!(!is_fetchable_remote_url(
            &Url::parse("https://example.local").expect("local suffix url should parse"),
        ));
        assert!(!is_fetchable_remote_url(
            &Url::parse("https://user:secret@example.com").expect("userinfo url should parse"),
        ));
    }

    #[test]
    fn accepts_public_http_and_https_hosts() {
        assert!(is_fetchable_remote_url(
            &Url::parse("https://example.com").expect("public https url should parse"),
        ));
        assert!(is_fetchable_remote_url(
            &Url::parse("http://subdomain.example.org/docs").expect("public http url should parse"),
        ));
    }

    #[test]
    fn extracts_title_description_and_icon_from_html_document() {
        let document = Html::parse_document(
            r#"
            <html>
              <head>
                <title>Fallback Title</title>
                <meta property="og:title" content="Roadmap Overview" />
                <meta name="description" content="Plain description fallback" />
                <meta property="og:description" content="Plan the next quarter in one place." />
                <link rel="icon" href="/favicon-32x32.png" sizes="32x32" />
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
              </head>
            </html>
            "#,
        );
        let page_url =
            Url::parse("https://example.com/products/roadmap").expect("page url should parse");

        assert_eq!(
            extract_link_title(&document).as_deref(),
            Some("Roadmap Overview")
        );
        assert_eq!(
            extract_link_description(&document).as_deref(),
            Some("Plan the next quarter in one place.")
        );
        let candidates = extract_icon_candidates(&document, &page_url);

        assert_eq!(
            candidates
                .first()
                .map(|candidate| candidate.url.to_string())
                .as_deref(),
            Some("https://example.com/favicon-32x32.png")
        );
    }

    #[test]
    fn deprioritizes_fluid_and_apple_icons_for_tab_style_selection() {
        let document = Html::parse_document(
            r#"
            <html>
              <head>
                <link rel="fluid-icon" href="https://example.com/fluidicon.png" />
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
              </head>
            </html>
            "#,
        );
        let page_url = Url::parse("https://example.com/docs").expect("page url should parse");

        let candidates = extract_icon_candidates(&document, &page_url);

        assert_eq!(
            candidates
                .first()
                .map(|candidate| candidate.url.to_string())
                .as_deref(),
            Some("https://example.com/favicon.svg")
        );
    }

    #[test]
    fn rejects_html_payloads_even_when_icon_url_looks_valid() {
        let icon_url =
            Url::parse("https://example.com/favicon.ico").expect("icon url should parse");

        assert_eq!(
            infer_icon_extension(
                Some("text/html; charset=utf-8"),
                &icon_url,
                b"<!doctype html><html><body>not an icon</body></html>",
            ),
            None
        );
    }

    #[test]
    fn defaults_include_common_favicon_paths() {
        let page_url =
            Url::parse("https://example.com/products/roadmap").expect("page url should parse");
        let candidates = default_icon_candidates(&page_url);

        assert_eq!(
            candidates
                .into_iter()
                .map(|candidate| candidate.url.to_string())
                .collect::<Vec<_>>(),
            vec![
                "https://example.com/favicon.ico".to_string(),
                "https://example.com/favicon.svg".to_string(),
                "https://example.com/favicon.png".to_string(),
            ]
        );
    }
}
