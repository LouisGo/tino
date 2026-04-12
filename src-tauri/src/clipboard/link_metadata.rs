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
use sha2::{Digest, Sha256};
use url::{Host, Url};

use crate::clipboard::types::{LinkMetadata, LinkMetadataFetchStatus};

const LINK_METADATA_ICON_DIR_NAME: &str = "link-icons";
const LINK_METADATA_USER_AGENT: &str =
    "Mozilla/5.0 (compatible; TinoClipboardLinkPreview/0.1; +https://tino.local)";
const LINK_METADATA_MAX_REDIRECTS: usize = 4;
const LINK_METADATA_HTML_READ_LIMIT_BYTES: usize = 256 * 1024;
const LINK_METADATA_ICON_READ_LIMIT_BYTES: usize = 512 * 1024;
const LINK_METADATA_REQUEST_TIMEOUT_SECS: u64 = 4;
const LINK_METADATA_CONNECT_TIMEOUT_SECS: u64 = 2;
const LINK_METADATA_TITLE_MAX_CHARS: usize = 140;
const LINK_METADATA_DESCRIPTION_MAX_CHARS: usize = 220;

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

    let (mut response, final_url) = match send_following_redirects(&client, initial_url) {
        Ok(result) => result,
        Err(_) => return failed_link_metadata(&fetched_at),
    };

    if !response.status().is_success() {
        return failed_link_metadata(&fetched_at);
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let html = if looks_like_html_response(&response, content_type.as_deref()) {
        read_limited_response_text(&mut response, LINK_METADATA_HTML_READ_LIMIT_BYTES)
    } else {
        None
    };

    let mut title = None;
    let mut description = None;
    let mut icon_url = None;

    if let Some(html) = html.as_deref() {
        let document = Html::parse_document(html);
        title = extract_link_title(&document);
        description = extract_link_description(&document);
        icon_url = extract_icon_url(&document, &final_url);
    }

    if icon_url.is_none() {
        icon_url = default_favicon_url(&final_url);
    }

    let icon_path = icon_url
        .as_ref()
        .and_then(|icon_url| fetch_icon_to_cache(&client, icon_url, clipboard_cache_root).ok())
        .flatten();

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

fn extract_icon_url(document: &Html, page_url: &Url) -> Option<Url> {
    let base_url = document_base_url(document, page_url).unwrap_or_else(|| page_url.clone());
    let selector = Selector::parse("link[rel][href]").ok()?;

    document
        .select(&selector)
        .filter_map(|element| {
            let rel = element.value().attr("rel")?.trim().to_ascii_lowercase();
            if !rel.contains("icon") {
                return None;
            }

            let href = element.value().attr("href")?.trim();
            if href.is_empty() || href.starts_with("data:") {
                return None;
            }

            let mut score = if rel.contains("apple-touch-icon") {
                80
            } else if rel.contains("shortcut icon") {
                90
            } else {
                100
            };

            if let Some(area) = element
                .value()
                .attr("sizes")
                .and_then(parse_icon_sizes_area)
            {
                score += area.min(4096);
            }

            base_url.join(href).ok().map(|url| (score, url))
        })
        .filter(|(_, url)| is_fetchable_remote_url(url))
        .max_by_key(|(score, _)| *score)
        .map(|(_, url)| url)
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

fn parse_icon_sizes_area(value: &str) -> Option<i32> {
    value
        .split_whitespace()
        .filter_map(|part| {
            let (width, height) = part.split_once('x')?;
            let width = width.parse::<i32>().ok()?;
            let height = height.parse::<i32>().ok()?;
            Some(width.saturating_mul(height))
        })
        .max()
}

fn default_favicon_url(page_url: &Url) -> Option<Url> {
    let mut favicon_url = page_url.clone();
    favicon_url.set_path("/favicon.ico");
    favicon_url.set_query(None);
    favicon_url.set_fragment(None);
    is_fetchable_remote_url(&favicon_url).then_some(favicon_url)
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
    let Some(extension) = infer_icon_extension(content_type.as_deref(), &final_url) else {
        return Ok(None);
    };

    let mut bytes = Vec::new();
    let mut reader = response.take((LINK_METADATA_ICON_READ_LIMIT_BYTES + 1) as u64);
    reader
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.is_empty() || bytes.len() > LINK_METADATA_ICON_READ_LIMIT_BYTES {
        return Ok(None);
    }

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

fn infer_icon_extension(content_type: Option<&str>, final_url: &Url) -> Option<&'static str> {
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
            _ => {}
        }
    }

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
        assert_eq!(
            extract_icon_url(&document, &page_url)
                .map(|url| url.to_string())
                .as_deref(),
            Some("https://example.com/apple-touch-icon.png")
        );
    }
}
