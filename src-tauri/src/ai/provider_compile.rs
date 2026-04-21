use std::collections::{BTreeSet, HashSet};

use reqwest::{
    blocking::Client,
    header::{AUTHORIZATION, CONTENT_TYPE},
};
use serde::Serialize;
use serde_json::{json, Value};

use crate::{
    ai::{
        batch_store::StoredBatchFile,
        compile_support::{is_complex_batch, is_weak_placeholder_capture, select_relevant_topics},
        contracts::{BatchCompileDecision, BatchCompileDisposition},
        knowledge_writer::{sanitize_inline_markdown, slugify_topic_value, truncate_inline_text},
        topic_index::TopicIndexEntry,
    },
    clipboard::types::CaptureRecord,
    error::{AppError, AppResult},
    locale::AppLocale,
    runtime_provider::{
        RuntimeProviderProfile, RuntimeProviderVendor, DEFAULT_DEEPSEEK_CHAT_MODEL,
        DEFAULT_DEEPSEEK_REASONER_MODEL,
    },
};

const PROVIDER_CONNECT_TIMEOUT_SECS: u64 = 10;
const PROVIDER_REQUEST_TIMEOUT_SECS: u64 = 120;
const MAX_PROMPT_CAPTURE_CHARS: usize = 1_800;
const MAX_PROMPT_TOPICS: usize = 8;
const MAX_PROVIDER_DECISIONS: usize = 8;
const TOPIC_CONFIDENCE_THRESHOLD: f64 = 0.65;
const LOW_DURABILITY_BLESSING_KEYWORDS: &[&str] = &[
    "愿你",
    "愿您",
    "祝你",
    "祝您",
    "幸福",
    "快乐",
    "平安",
    "吉祥",
    "甜蜜",
    "顺利",
    "成功",
    "健康",
    "好运",
    "立春",
    "人生",
    "心愿",
    "春光",
    "花朵",
    "温暖",
    "开心",
    "语录",
    "励志",
    "哲理",
    "鸡汤",
    "wish you",
    "blessing",
    "happiness",
    "joy",
    "peace",
    "good luck",
    "motivation",
    "motivational",
    "inspiration",
    "inspirational",
    "quote",
    "quotes",
];
const DURABLE_TECHNICAL_KEYWORDS: &[&str] = &[
    "rust",
    "react",
    "typescript",
    "zustand",
    "api",
    "sdk",
    "llm",
    "prompt",
    "agent",
    "ocr",
    "sqlite",
    "schema",
    "queue",
    "batch",
    "runtime",
    "provider",
    "topic",
    "wiki",
    "hook",
    "fiber",
    "frontend",
    "backend",
    "缓存",
    "调试",
    "异常",
    "数据",
    "日志",
    "控制台",
    "链路",
    "二次确认",
    "策略",
    "方案",
    "实现",
    "修复",
    "优化",
    "面试",
    "前端",
    "后端",
    "渲染",
    "状态管理",
    "模型",
    "编译",
    "数据库",
    "接口",
];

pub struct ProviderBatchCompileResult {
    pub source_label: String,
    pub decisions: Vec<BatchCompileDecision>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptPayload {
    batch_id: String,
    trigger_reason: String,
    captures: Vec<PromptCapture>,
    relevant_topics: Vec<PromptTopic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptCapture {
    id: String,
    content_kind: String,
    source_app_name: Option<String>,
    captured_at: String,
    raw_text_excerpt: String,
    link_url: Option<String>,
    link_title: Option<String>,
    link_description: Option<String>,
    signal_hint: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PromptTopic {
    topic_slug: String,
    topic_name: String,
    topic_summary: String,
    recent_tags: Vec<String>,
}

#[derive(Debug, Clone)]
struct SelectedModel {
    model: String,
}

#[derive(Debug, Clone)]
struct GuardedBatch {
    prompt_batch: StoredBatchFile,
    local_decisions: Vec<BatchCompileDecision>,
}

pub fn compile_batch_with_provider(
    profile: &RuntimeProviderProfile,
    batch: &StoredBatchFile,
    topics: &[TopicIndexEntry],
    preferred_locale: AppLocale,
) -> AppResult<ProviderBatchCompileResult> {
    let guarded_batch = prepare_guarded_batch(batch, preferred_locale);
    let selected_model = select_background_compile_model(profile, &guarded_batch.prompt_batch);
    let source_label = build_source_label(profile, &selected_model.model);

    if guarded_batch.prompt_batch.captures.is_empty() {
        return Ok(ProviderBatchCompileResult {
            source_label: format!("{source_label} · local-safety-guard"),
            decisions: guarded_batch.local_decisions,
        });
    }

    let relevant_topics =
        select_relevant_topics(&guarded_batch.prompt_batch, topics, MAX_PROMPT_TOPICS)
            .into_iter()
            .map(|topic| PromptTopic {
                topic_slug: topic.topic_slug.clone(),
                topic_name: topic.topic_name.clone(),
                topic_summary: truncate_inline_text(
                    &sanitize_inline_markdown(&topic.topic_summary),
                    220,
                ),
                recent_tags: topic.recent_tags.iter().take(5).cloned().collect(),
            })
            .collect::<Vec<_>>();
    let user_prompt = build_user_prompt(&guarded_batch.prompt_batch, &relevant_topics)?;
    let system_prompt = build_background_compile_system_prompt(preferred_locale);
    let response_text =
        request_provider_json(profile, &selected_model.model, &system_prompt, &user_prompt)?;
    let mut decisions = normalize_provider_decisions(
        &guarded_batch.prompt_batch,
        topics,
        &response_text,
        preferred_locale,
    )?;
    decisions.extend(guarded_batch.local_decisions);

    Ok(ProviderBatchCompileResult {
        source_label,
        decisions,
    })
}

fn build_background_compile_system_prompt(preferred_locale: AppLocale) -> String {
    format!(
        r#"You are Tino's background knowledge compiler.

Return only a single JSON object and nothing else.

The user's preferred output locale is {locale_label}.
Generate all human-facing fields in that locale: topicName, title, summary, keyPoints, tags, and rationale.

The JSON shape must be:
{{
  "decisions": [
    {{
      "sourceCaptureIds": ["capture-id"],
      "disposition": "write_topic" | "write_inbox" | "discard_noise",
      "topicSlug": "optional-slug-or-null",
      "topicName": "optional-topic-name-or-null",
      "title": "short title",
      "summary": "short plain-text summary",
      "keyPoints": ["point 1", "point 2"],
      "tags": ["tag-a", "tag-b"],
      "confidence": 0.0,
      "rationale": "one short explanation"
    }}
  ]
}}

Rules:
- Every source capture id must appear in exactly one decision.
- Reuse an existing topic only when semantic overlap is strong.
- If overlap is weak, prefer write_inbox over forcing the wrong topic.
- Create a new topic only when the batch expresses durable knowledge.
- Topic names should read like native knowledge headings in the user's locale, not abstract paper titles or generic taxonomies.
- topicSlug is a stable technical identifier and should stay concise ASCII.
- If you reuse an existing topic, copy its exact topicSlug.
- topicName may be localized for the user's locale even when topicSlug is reused, but it must stay semantically equivalent to the topic.
- {locale_specific_rule}
- Link-only or weak-context references should usually go to write_inbox.
- Single short blessings, greetings, motivational quotes, and emotional one-off text should usually go to write_inbox, not write_topic.
- OCR-corrupted text, garbled forwards, placeholders, credentials, verification codes, or low-signal artifacts should go to discard_noise.
- If disposition is write_topic, provide topicSlug and topicName.
- If you create a new topic, choose a concise stable topicName and a concise slug without spaces.
- Keep title under 80 characters.
- Keep summary under 280 characters.
- Keep keyPoints to 1-4 items.
- Keep tags to 0-5 short items.
- Do not use Markdown in fields.
- Prefer the semantic text, not screenshot placeholder text, as the knowledge anchor."#,
        locale_label = preferred_locale_label(preferred_locale),
        locale_specific_rule = locale_specific_output_rule(preferred_locale),
    )
}

fn build_user_prompt(batch: &StoredBatchFile, topics: &[PromptTopic]) -> AppResult<String> {
    let prompt = PromptPayload {
        batch_id: batch.id.clone(),
        trigger_reason: batch.trigger_reason.clone(),
        captures: batch
            .captures
            .iter()
            .map(|capture| PromptCapture {
                id: capture.id.clone(),
                content_kind: capture.content_kind.clone(),
                source_app_name: capture.source_app_name.clone(),
                captured_at: capture.captured_at.clone(),
                raw_text_excerpt: truncate_inline_text(
                    &sanitize_capture_text_for_prompt(&capture.raw_text),
                    MAX_PROMPT_CAPTURE_CHARS,
                ),
                link_url: capture.link_url.clone(),
                link_title: capture
                    .link_metadata
                    .as_ref()
                    .and_then(|metadata| metadata.title.clone()),
                link_description: capture
                    .link_metadata
                    .as_ref()
                    .and_then(|metadata| metadata.description.clone())
                    .map(|value| truncate_inline_text(&sanitize_inline_markdown(&value), 180)),
                signal_hint: capture_signal_hint(capture),
            })
            .collect(),
        relevant_topics: topics.to_vec(),
    };

    let serialized = serde_json::to_string_pretty(&prompt)
        .map_err(|error| AppError::json("failed to serialize background compile prompt", error))?;
    Ok(format!(
        "Compile this Tino batch into structured decisions.\n\
         Existing topics are advisory, not mandatory.\n\
         If none of them fits strongly, create a new topic or route to inbox.\n\
         Return only the JSON object.\n\n{serialized}"
    ))
}

fn request_provider_json(
    profile: &RuntimeProviderProfile,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let base_url = profile.base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err(AppError::validation(
            "background compile baseUrl is required",
        ));
    }

    let api_key = profile.api_key.trim();
    if api_key.is_empty() {
        return Err(AppError::validation(
            "background compile apiKey is required",
        ));
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(
            PROVIDER_CONNECT_TIMEOUT_SECS,
        ))
        .timeout(std::time::Duration::from_secs(
            PROVIDER_REQUEST_TIMEOUT_SECS,
        ))
        .build()
        .map_err(|error| {
            AppError::platform(format!(
                "failed to initialize background compile provider client: {error}"
            ))
        })?;

    let request_body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "stream": false,
        "temperature": 0.1,
        "response_format": {
            "type": "json_object",
        }
    });
    let endpoint = format!("{base_url}/chat/completions");
    let request_body_bytes = serde_json::to_vec(&request_body).map_err(|error| {
        AppError::json(
            "failed to serialize background compile provider request body",
            error,
        )
    })?;
    let response = client
        .post(&endpoint)
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
        .header(CONTENT_TYPE, "application/json")
        .body(request_body_bytes)
        .send()
        .map_err(|error| {
            AppError::platform(format!(
                "background compile provider request failed: {error}"
            ))
        })?;
    let status = response.status();
    let response_text = response.text().map_err(|error| {
        AppError::platform(format!(
            "failed to read background compile provider response: {error}"
        ))
    })?;

    if !status.is_success() {
        let provider_message =
            extract_provider_error_message(&response_text).unwrap_or_else(|| response_text.clone());
        return Err(AppError::platform(format!(
            "background compile provider request returned {status}: {}",
            truncate_inline_text(&sanitize_inline_markdown(&provider_message), 280)
        )));
    }

    let payload = serde_json::from_str::<Value>(&response_text).map_err(|error| {
        AppError::json(
            "failed to parse background compile provider response",
            error,
        )
    })?;
    let content = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(extract_message_text)
        .ok_or_else(|| {
            AppError::platform(
                "background compile provider response did not contain message content",
            )
        })?;

    Ok(strip_markdown_code_fence(&content))
}

fn normalize_provider_decisions(
    batch: &StoredBatchFile,
    topics: &[TopicIndexEntry],
    response_text: &str,
    preferred_locale: AppLocale,
) -> AppResult<Vec<BatchCompileDecision>> {
    let payload = serde_json::from_str::<Value>(response_text)
        .map_err(|error| AppError::json("failed to parse background compile JSON output", error))?;
    let raw_decisions = payload
        .get("decisions")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::validation("background compile output is missing decisions[]"))?;

    let captures_by_id = batch
        .captures
        .iter()
        .map(|capture| (capture.id.as_str(), capture))
        .collect::<std::collections::BTreeMap<_, _>>();
    let existing_topics_by_slug = topics
        .iter()
        .map(|topic| (topic.topic_slug.as_str(), topic))
        .collect::<std::collections::BTreeMap<_, _>>();
    let existing_topics_by_name = topics
        .iter()
        .map(|topic| (topic.topic_name.to_lowercase(), topic))
        .collect::<std::collections::BTreeMap<_, _>>();
    let mut used_capture_ids = HashSet::new();
    let mut decisions = Vec::new();

    for (index, value) in raw_decisions
        .iter()
        .take(MAX_PROVIDER_DECISIONS)
        .enumerate()
    {
        let Some(mut decision) = normalize_single_decision(
            batch,
            value,
            index,
            &captures_by_id,
            &existing_topics_by_slug,
            &existing_topics_by_name,
            &mut used_capture_ids,
            preferred_locale,
        ) else {
            continue;
        };

        let source_captures = decision
            .source_capture_ids
            .iter()
            .filter_map(|source_id| captures_by_id.get(source_id.as_str()).copied())
            .collect::<Vec<_>>();
        let only_links = !source_captures.is_empty()
            && source_captures
                .iter()
                .all(|capture| capture.content_kind == "link");
        if decision.disposition == BatchCompileDisposition::WriteTopic
            && (decision.confidence < TOPIC_CONFIDENCE_THRESHOLD || only_links)
        {
            decision.disposition = BatchCompileDisposition::WriteInbox;
            decision.topic_slug = None;
            decision.topic_name = None;
            decision.rationale = if only_links {
                "The model proposed a topic write for link-only material, so Tino downgraded it to inbox.".into()
            } else {
                format!(
                    "{} Tino downgraded it to inbox because topic writes require higher confidence.",
                    decision.rationale
                )
            };
        }

        apply_local_quality_overrides(&mut decision, &source_captures, preferred_locale);
        decisions.push(decision);
    }

    if decisions.is_empty() && !batch.captures.is_empty() {
        return Err(AppError::validation(
            "background compile output did not contain any valid decisions",
        ));
    }

    append_missing_capture_fallbacks(
        batch,
        &captures_by_id,
        &mut decisions,
        &used_capture_ids,
        preferred_locale,
    );
    Ok(decisions)
}

fn normalize_single_decision(
    batch: &StoredBatchFile,
    value: &Value,
    index: usize,
    captures_by_id: &std::collections::BTreeMap<&str, &CaptureRecord>,
    existing_topics_by_slug: &std::collections::BTreeMap<&str, &TopicIndexEntry>,
    existing_topics_by_name: &std::collections::BTreeMap<String, &TopicIndexEntry>,
    used_capture_ids: &mut HashSet<String>,
    preferred_locale: AppLocale,
) -> Option<BatchCompileDecision> {
    let disposition = parse_disposition(value)?;
    let source_capture_ids = value
        .get("sourceCaptureIds")
        .or_else(|| value.get("sourceIds"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
        .into_iter()
        .filter(|source_id| captures_by_id.contains_key(source_id.as_str()))
        .filter(|source_id| used_capture_ids.insert(source_id.clone()))
        .collect::<Vec<_>>();

    if source_capture_ids.is_empty() {
        return None;
    }

    let source_captures = source_capture_ids
        .iter()
        .filter_map(|source_id| captures_by_id.get(source_id.as_str()).copied())
        .collect::<Vec<_>>();
    let default_title = source_captures
        .first()
        .map(|capture| build_capture_title(capture))
        .unwrap_or_else(|| format!("Batch {}", batch.id));
    let title = string_field(value, "title").unwrap_or_else(|| default_title.clone());
    let summary = string_field(value, "summary").unwrap_or_else(|| {
        source_captures
            .first()
            .map(|capture| truncate_inline_text(&sanitize_inline_markdown(&capture.raw_text), 220))
            .unwrap_or_else(|| title.clone())
    });
    let mut tags = array_of_strings(value, "tags")
        .into_iter()
        .map(|item| normalize_tag(&item))
        .filter(|value| !value.is_empty())
        .collect::<BTreeSet<_>>();
    for capture in &source_captures {
        if let Some(source_app_name) = capture.source_app_name.as_deref() {
            let normalized = normalize_tag(source_app_name);
            if !normalized.is_empty() {
                tags.insert(normalized);
            }
        }
    }
    let mut key_points = array_of_strings(value, "keyPoints")
        .into_iter()
        .map(|item| truncate_inline_text(&sanitize_inline_markdown(&item), 160))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if key_points.is_empty() {
        key_points.push(truncate_inline_text(&summary, 160));
    }
    key_points.truncate(4);

    let confidence = value
        .get("confidence")
        .and_then(Value::as_f64)
        .unwrap_or_else(|| default_confidence(disposition))
        .clamp(0.0, 1.0);
    let mut rationale = string_field(value, "rationale")
        .unwrap_or_else(|| "Background compile normalization filled missing rationale.".into());
    let mut topic_slug = string_field(value, "topicSlug");
    let mut topic_name = string_field(value, "topicName");

    if disposition == BatchCompileDisposition::WriteTopic {
        if let Some(existing_topic) = topic_slug
            .as_deref()
            .and_then(|slug| existing_topics_by_slug.get(slug))
        {
            topic_slug = Some(existing_topic.topic_slug.clone());
        } else if let Some(existing_topic) = topic_name
            .as_deref()
            .map(str::trim)
            .map(str::to_lowercase)
            .and_then(|name| existing_topics_by_name.get(&name))
        {
            topic_slug = Some(existing_topic.topic_slug.clone());
            if topic_name
                .as_deref()
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
            {
                topic_name = Some(existing_topic.topic_name.clone());
            }
        }

        let resolved_name = topic_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| title.clone());
        let resolved_slug = topic_slug
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| slugify_topic_value(&resolved_name));
        topic_name = Some(truncate_inline_text(
            &sanitize_inline_markdown(&resolved_name),
            80,
        ));
        topic_slug = Some(truncate_inline_text(
            &sanitize_inline_markdown(&resolved_slug),
            120,
        ));
        topic_name = align_topic_name_with_locale(topic_name, &title, &summary, preferred_locale);
    } else {
        topic_slug = None;
        topic_name = None;
    }

    if source_captures
        .iter()
        .all(|capture| is_weak_placeholder_capture(capture))
    {
        rationale = localized_text(
            preferred_locale,
            "The captures are weak clipboard placeholders, so Tino discarded them locally.",
            "这些内容只是弱信号剪贴板占位符，Tino 已在本地丢弃。",
        );
        return Some(BatchCompileDecision {
            decision_id: format!("{}_decision_{}", batch.id, index + 1),
            disposition: BatchCompileDisposition::DiscardNoise,
            source_capture_ids,
            topic_slug: None,
            topic_name: None,
            title: localized_text(
                preferred_locale,
                "Low-signal clipboard artifact",
                "低信号剪贴板片段",
            ),
            summary: localized_text(
                preferred_locale,
                "Weak placeholder captures were discarded instead of being written into knowledge files.",
                "弱信号占位内容已被本地丢弃，不会写入知识库。",
            ),
            key_points: vec![localized_text(
                preferred_locale,
                "Weak placeholder capture.",
                "弱信号占位内容。",
            )],
            tags: vec!["discarded".into(), "placeholder".into()],
            confidence: 0.98,
            rationale,
        });
    }

    Some(BatchCompileDecision {
        decision_id: format!("{}_decision_{}", batch.id, index + 1),
        disposition,
        source_capture_ids,
        topic_slug,
        topic_name,
        title: truncate_inline_text(&sanitize_inline_markdown(&title), 80),
        summary: truncate_inline_text(&sanitize_inline_markdown(&summary), 280),
        key_points,
        tags: tags.into_iter().take(5).collect(),
        confidence,
        rationale: truncate_inline_text(&sanitize_inline_markdown(&rationale), 240),
    })
}

fn append_missing_capture_fallbacks(
    batch: &StoredBatchFile,
    captures_by_id: &std::collections::BTreeMap<&str, &CaptureRecord>,
    decisions: &mut Vec<BatchCompileDecision>,
    used_capture_ids: &HashSet<String>,
    preferred_locale: AppLocale,
) {
    for capture in &batch.captures {
        if used_capture_ids.contains(&capture.id) {
            continue;
        }

        let source_capture_ids = vec![capture.id.clone()];
        let disposition = if capture.content_kind == "link" {
            BatchCompileDisposition::WriteInbox
        } else if is_weak_placeholder_capture(capture) {
            BatchCompileDisposition::DiscardNoise
        } else {
            BatchCompileDisposition::WriteInbox
        };
        let source_capture = captures_by_id
            .get(capture.id.as_str())
            .copied()
            .unwrap_or(capture);
        let title = match disposition {
            BatchCompileDisposition::WriteInbox if capture.content_kind == "link" => {
                localized_text(
                    preferred_locale,
                    "Reference links pending calmer compilation",
                    "待后续处理的参考链接",
                )
            }
            BatchCompileDisposition::DiscardNoise => localized_text(
                preferred_locale,
                "Low-signal clipboard artifact",
                "低信号剪贴板片段",
            ),
            _ => build_capture_title(source_capture),
        };
        let summary = match disposition {
            BatchCompileDisposition::WriteInbox if capture.content_kind == "link" => {
                localized_text(
                    preferred_locale,
                    "A reference capture was not confidently merged into long-term knowledge, so Tino kept it in inbox.",
                    "这条参考链接暂时无法可靠并入长期知识，因此先保留在 inbox。",
                )
            }
            BatchCompileDisposition::DiscardNoise => localized_text(
                preferred_locale,
                "A weak placeholder capture was discarded locally instead of being written into knowledge files.",
                "弱信号占位内容已在本地丢弃，不会写入知识库。",
            ),
            _ => localized_text(
                preferred_locale,
                "The provider left this capture unassigned, so Tino kept it in inbox for a calmer pass.",
                "模型没有可靠地归类这条内容，因此 Tino 先将其保留到 inbox。",
            ),
        };

        decisions.push(BatchCompileDecision {
            decision_id: format!("{}_fallback_{}", batch.id, decisions.len() + 1),
            disposition,
            source_capture_ids,
            topic_slug: None,
            topic_name: None,
            title,
            summary,
            key_points: vec![truncate_inline_text(
                &sanitize_inline_markdown(&capture.raw_text),
                160,
            )],
            tags: fallback_tags_for_capture(capture),
            confidence: match disposition {
                BatchCompileDisposition::DiscardNoise => 0.9,
                BatchCompileDisposition::WriteInbox => 0.4,
                BatchCompileDisposition::WriteTopic => 0.7,
            },
            rationale: match disposition {
                BatchCompileDisposition::DiscardNoise => localized_text(
                    preferred_locale,
                    "Tino discarded this low-signal placeholder locally because it adds no durable knowledge.",
                    "这条低信号占位内容不具备长期知识价值，Tino 已在本地丢弃。",
                ),
                _ => localized_text(
                    preferred_locale,
                    "The provider left this capture uncovered, so Tino routed it to inbox as a conservative fallback.",
                    "模型没有覆盖这条内容，因此 Tino 采用保守策略将其转入 inbox。",
                ),
            },
        });
    }
}

fn apply_local_quality_overrides(
    decision: &mut BatchCompileDecision,
    source_captures: &[&CaptureRecord],
    preferred_locale: AppLocale,
) {
    if source_captures.is_empty() {
        return;
    }

    let source_text = collect_source_capture_text(source_captures);
    if source_text.is_empty() {
        return;
    }

    if looks_like_garbled_low_signal_capture_bundle(source_captures, &source_text) {
        rewrite_decision_as_discard(
            decision,
            source_captures,
            &localized_text(
                preferred_locale,
                "The capture looked like obvious OCR or garbled noise, so Tino kept it out of the knowledge layer.",
                "文本包含明显 OCR/乱码噪音，Tino 未将其写入知识层。",
            ),
            &localized_text(
                preferred_locale,
                "The source text looks like OCR mistakes or forwarding residue, so Tino downgraded it to discard_noise locally.",
                "源文本疑似 OCR 误识别或转发残片，信号噪音远高于知识价值，已在本地降级为 discard_noise。",
            ),
            &["ocr-noise", "quality-guard"],
            0.98,
            preferred_locale,
        );
        return;
    }

    if decision.disposition != BatchCompileDisposition::WriteTopic {
        return;
    }

    if looks_like_low_durability_single_capture(source_captures, &source_text) {
        rewrite_decision_as_inbox(
            decision,
            source_captures,
            &localized_text(
                preferred_locale,
                "This single blessing or motivational snippet is not durable enough for a topic, so Tino kept it in inbox.",
                "这类单条祝福/鸡汤/情绪化文本不直接进入 topic，先保守留在 inbox。",
            ),
            &localized_text(
                preferred_locale,
                "This single short snippet lacks durable knowledge signals, so Tino kept it in inbox instead of writing a topic.",
                "单条短文本缺少长期知识的耐久性信号，Tino 不把它直接编译成 topic，而是保守保留到 inbox。",
            ),
            &["low-durability", "quality-guard"],
            0.88,
            preferred_locale,
        );
        return;
    }

    if decision.disposition == BatchCompileDisposition::WriteTopic
        && should_downgrade_topic_for_locale_mismatch(decision, preferred_locale)
    {
        rewrite_decision_as_inbox(
            decision,
            source_captures,
            &localized_text(
                preferred_locale,
                "The generated topic does not match the user's preferred locale, so Tino kept it in inbox for a calmer pass.",
                "当前生成结果没有遵循用户的界面语言，Tino 先保守留在 inbox。",
            ),
            &localized_text(
                preferred_locale,
                "The model returned a topic in the wrong user locale. To avoid writing a mismatched knowledge title, Tino downgraded it to inbox.",
                "模型返回的 topic 没有遵循当前用户 locale。为避免把错误语言的知识标题直接落库，Tino 先将其降到 inbox。",
            ),
            &["language-guard", "quality-guard"],
            0.86,
            preferred_locale,
        );
    }
}

fn rewrite_decision_as_inbox(
    decision: &mut BatchCompileDecision,
    source_captures: &[&CaptureRecord],
    summary: &str,
    rationale: &str,
    extra_tags: &[&str],
    confidence: f64,
    preferred_locale: AppLocale,
) {
    let fallback_title = source_captures
        .first()
        .map(|capture| build_capture_title(capture))
        .unwrap_or_else(|| localized_text(preferred_locale, "Uncompiled item", "未编译条目"));

    decision.disposition = BatchCompileDisposition::WriteInbox;
    decision.topic_slug = None;
    decision.topic_name = None;
    decision.title = fallback_title;
    decision.summary = summary.into();
    decision.tags = quality_guard_tags(source_captures, extra_tags);
    decision.confidence = confidence;
    decision.rationale = truncate_inline_text(&sanitize_inline_markdown(rationale), 240);
    decision.title = truncate_inline_text(&sanitize_inline_markdown(&decision.title), 80);
    decision.summary = truncate_inline_text(&sanitize_inline_markdown(&decision.summary), 280);
    decision.key_points = vec![fallback_title_from_sources(
        source_captures,
        preferred_locale,
    )];
}

fn rewrite_decision_as_discard(
    decision: &mut BatchCompileDecision,
    source_captures: &[&CaptureRecord],
    summary: &str,
    rationale: &str,
    extra_tags: &[&str],
    confidence: f64,
    preferred_locale: AppLocale,
) {
    decision.disposition = BatchCompileDisposition::DiscardNoise;
    decision.topic_slug = None;
    decision.topic_name = None;
    decision.title = localized_text(
        preferred_locale,
        "Possible OCR noise fragment",
        "疑似 OCR 噪音片段",
    );
    decision.summary = summary.into();
    decision.key_points = vec![fallback_title_from_sources(
        source_captures,
        preferred_locale,
    )];
    decision.tags = quality_guard_tags(source_captures, extra_tags);
    decision.confidence = confidence;
    decision.rationale = truncate_inline_text(&sanitize_inline_markdown(rationale), 240);
}

fn fallback_title_from_sources(
    source_captures: &[&CaptureRecord],
    preferred_locale: AppLocale,
) -> String {
    source_captures
        .first()
        .map(|capture| truncate_inline_text(&sanitize_inline_markdown(&capture.raw_text), 160))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            localized_text(
                preferred_locale,
                "The source fragment did not provide additional context.",
                "源片段未提供额外上下文。",
            )
        })
}

fn quality_guard_tags(source_captures: &[&CaptureRecord], extra_tags: &[&str]) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for capture in source_captures {
        for tag in fallback_tags_for_capture(capture) {
            tags.insert(tag);
        }
    }
    for extra in extra_tags {
        tags.insert((*extra).to_string());
    }

    tags.into_iter().take(5).collect()
}

fn collect_source_capture_text(source_captures: &[&CaptureRecord]) -> String {
    source_captures
        .iter()
        .map(|capture| sanitize_inline_markdown(&capture.raw_text))
        .collect::<Vec<_>>()
        .join(" ")
}

fn looks_like_low_durability_single_capture(
    source_captures: &[&CaptureRecord],
    source_text: &str,
) -> bool {
    if source_captures.len() != 1
        || source_captures[0].content_kind == "link"
        || has_technical_signal(source_text)
    {
        return false;
    }

    let normalized = source_text.to_lowercase();
    let short_text = source_text.chars().count() <= 280;
    let blessing_hits = keyword_hit_count(&normalized, LOW_DURABILITY_BLESSING_KEYWORDS);
    let starts_like_blessing = normalized.starts_with("愿你")
        || normalized.starts_with("愿您")
        || normalized.starts_with("祝你")
        || normalized.starts_with("祝您");

    short_text && (starts_like_blessing || blessing_hits >= 3)
}

fn looks_like_garbled_low_signal_capture_bundle(
    source_captures: &[&CaptureRecord],
    source_text: &str,
) -> bool {
    if source_captures.is_empty() || has_technical_signal(source_text) {
        return false;
    }

    let normalized = source_text.to_lowercase();
    let blessing_hits = keyword_hit_count(&normalized, LOW_DURABILITY_BLESSING_KEYWORDS);
    let suspicious_tokens = suspicious_mixed_token_count(source_text);
    let unusual_symbols = unusual_symbol_count(source_text);
    let short_text = source_text.chars().count() <= 320;

    short_text
        && ((contains_cjk_text(source_text)
            && blessing_hits >= 2
            && suspicious_tokens >= 1
            && unusual_symbols >= 2)
            || (suspicious_tokens >= 2 && unusual_symbols >= 1))
}

fn has_technical_signal(value: &str) -> bool {
    let normalized = value.to_lowercase();
    keyword_hit_count(&normalized, DURABLE_TECHNICAL_KEYWORDS) >= 1
        || normalized.contains("::")
        || normalized.contains("->")
        || normalized.contains("http://")
        || normalized.contains("https://")
        || normalized.contains("useeffect")
        || normalized.contains("uselayouteffect")
}

fn should_downgrade_topic_for_locale_mismatch(
    decision: &BatchCompileDecision,
    preferred_locale: AppLocale,
) -> bool {
    match preferred_locale {
        AppLocale::ZhCn => {
            is_latin_dominant_text(&decision.title) && is_latin_dominant_text(&decision.summary)
        }
        AppLocale::EnUs => {
            contains_cjk_text(&decision.title) && contains_cjk_text(&decision.summary)
        }
    }
}

fn align_topic_name_with_locale(
    topic_name: Option<String>,
    title: &str,
    summary: &str,
    preferred_locale: AppLocale,
) -> Option<String> {
    let localized_title = truncate_inline_text(&sanitize_inline_markdown(title), 80);
    let normalized_topic_name = topic_name
        .map(|value| truncate_inline_text(&sanitize_inline_markdown(&value), 80))
        .filter(|value| !value.trim().is_empty());

    match preferred_locale {
        AppLocale::ZhCn => {
            if normalized_topic_name
                .as_deref()
                .map(is_latin_dominant_text)
                .unwrap_or(false)
                && (contains_cjk_text(title) || contains_cjk_text(summary))
            {
                Some(localized_title)
            } else {
                normalized_topic_name.or(Some(localized_title))
            }
        }
        AppLocale::EnUs => {
            if normalized_topic_name
                .as_deref()
                .map(contains_cjk_text)
                .unwrap_or(false)
                && !contains_cjk_text(title)
            {
                Some(localized_title)
            } else {
                normalized_topic_name.or(Some(localized_title))
            }
        }
    }
}

fn preferred_locale_label(preferred_locale: AppLocale) -> &'static str {
    match preferred_locale {
        AppLocale::EnUs => "English (en-US)",
        AppLocale::ZhCn => "Simplified Chinese (zh-CN)",
    }
}

fn locale_specific_output_rule(preferred_locale: AppLocale) -> &'static str {
    match preferred_locale {
        AppLocale::EnUs => {
            "Use English for natural-language output. Keep literal code symbols, API names, and product names only when they should remain unchanged."
        }
        AppLocale::ZhCn => {
            "使用简体中文输出自然语言内容。代码符号、API 名称和产品名等字面量可保持原样，不要把自然语言标题和摘要写成英文。"
        }
    }
}

fn localized_text(preferred_locale: AppLocale, english: &str, simplified_chinese: &str) -> String {
    match preferred_locale {
        AppLocale::EnUs => english.into(),
        AppLocale::ZhCn => simplified_chinese.into(),
    }
}

fn keyword_hit_count(value: &str, keywords: &[&str]) -> usize {
    keywords
        .iter()
        .filter(|keyword| value.contains(**keyword))
        .count()
}

fn suspicious_mixed_token_count(value: &str) -> usize {
    let mut count = 0usize;
    let mut current = String::new();

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            current.push(character);
        } else {
            count += suspicious_ascii_run_count(&current);
            current.clear();
        }
    }

    count + suspicious_ascii_run_count(&current)
}

fn suspicious_ascii_run_count(value: &str) -> usize {
    let trimmed = value.trim();
    let length = trimmed.chars().count();
    if length >= 4
        && length <= 12
        && trimmed
            .chars()
            .any(|character| character.is_ascii_alphabetic())
        && trimmed.chars().any(|character| character.is_ascii_digit())
        && !trimmed.starts_with("http")
    {
        1
    } else {
        0
    }
}

fn unusual_symbol_count(value: &str) -> usize {
    value
        .chars()
        .filter(|character| is_unusual_symbol(*character))
        .count()
}

fn is_unusual_symbol(character: char) -> bool {
    !character.is_whitespace()
        && !character.is_alphanumeric()
        && !contains_cjk(character)
        && !matches!(
            character,
            ',' | '.'
                | ';'
                | ':'
                | '!'
                | '?'
                | '('
                | ')'
                | '['
                | ']'
                | '{'
                | '}'
                | '<'
                | '>'
                | '-'
                | '_'
                | '/'
                | '\\'
                | '|'
                | '"'
                | '\''
                | '+'
                | '='
                | '%'
                | '#'
                | '&'
                | '*'
                | '@'
                | '~'
                | '，'
                | '。'
                | '；'
                | '：'
                | '！'
                | '？'
                | '（'
                | '）'
                | '【'
                | '】'
                | '《'
                | '》'
                | '、'
                | '“'
                | '”'
                | '‘'
                | '’'
        )
}

fn contains_cjk_text(value: &str) -> bool {
    value.chars().any(contains_cjk)
}

fn is_latin_dominant_text(value: &str) -> bool {
    let latin_chars = value
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count();
    let cjk_chars = value
        .chars()
        .filter(|character| contains_cjk(*character))
        .count();

    latin_chars >= 8 && latin_chars > cjk_chars * 2
}

fn contains_cjk(character: char) -> bool {
    matches!(
        character as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x3040..=0x30FF
            | 0xAC00..=0xD7AF
    )
}

fn prepare_guarded_batch(batch: &StoredBatchFile, preferred_locale: AppLocale) -> GuardedBatch {
    let mut prompt_captures = Vec::new();
    let mut local_decisions = Vec::new();

    for capture in &batch.captures {
        if should_discard_locally_as_sensitive(capture) {
            local_decisions.push(BatchCompileDecision {
                decision_id: format!("{}_sensitive_{}", batch.id, capture.id),
                disposition: BatchCompileDisposition::DiscardNoise,
                source_capture_ids: vec![capture.id.clone()],
                topic_slug: None,
                topic_name: None,
                title: localized_text(
                    preferred_locale,
                    "Sensitive credential capture",
                    "敏感凭证片段",
                ),
                summary: localized_text(
                    preferred_locale,
                    "This capture looked like a token or credential, so Tino discarded it locally instead of sending it to the model.",
                    "这条内容看起来像 token 或凭证，Tino 已在本地丢弃，不会发送给模型。",
                ),
                key_points: vec![localized_text(
                    preferred_locale,
                    "Sensitive token-like capture was blocked locally.",
                    "疑似敏感 token 的内容已在本地拦截。",
                )],
                tags: vec!["sensitive".into(), "local-guard".into()],
                confidence: 0.99,
                rationale: localized_text(
                    preferred_locale,
                    "Provider-bound background compile must not send obvious tokens or credentials to an external model.",
                    "provider 直连的后台编译不能把明显的 token 或凭证发送到外部模型。",
                ),
            });
            continue;
        }

        let mut sanitized_capture = capture.clone();
        sanitized_capture.raw_text = sanitize_capture_text_for_prompt(&capture.raw_text);
        prompt_captures.push(sanitized_capture);
    }

    GuardedBatch {
        prompt_batch: StoredBatchFile {
            id: batch.id.clone(),
            status: batch.status.clone(),
            created_at: batch.created_at.clone(),
            trigger_reason: batch.trigger_reason.clone(),
            capture_count: prompt_captures.len(),
            first_captured_at: batch.first_captured_at.clone(),
            last_captured_at: batch.last_captured_at.clone(),
            source_ids: prompt_captures
                .iter()
                .map(|capture| capture.id.clone())
                .collect(),
            captures: prompt_captures,
        },
        local_decisions,
    }
}

fn parse_disposition(value: &Value) -> Option<BatchCompileDisposition> {
    match string_field(value, "disposition")
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .as_str()
    {
        "write_topic" | "archive_to_topic" | "topic" => Some(BatchCompileDisposition::WriteTopic),
        "write_inbox" | "send_to_inbox" | "inbox" => Some(BatchCompileDisposition::WriteInbox),
        "discard_noise" | "discard" | "noise" => Some(BatchCompileDisposition::DiscardNoise),
        _ => None,
    }
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| sanitize_inline_markdown(value))
}

fn array_of_strings(value: &Value, field: &str) -> Vec<String> {
    value
        .get(field)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(|item| sanitize_inline_markdown(item))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn build_capture_title(capture: &CaptureRecord) -> String {
    if capture.content_kind == "link" {
        if let Some(link_url) = capture.link_url.as_deref() {
            return truncate_inline_text(link_url.trim(), 72);
        }
    }

    truncate_inline_text(&sanitize_inline_markdown(&capture.raw_text), 72)
}

fn fallback_tags_for_capture(capture: &CaptureRecord) -> Vec<String> {
    let mut tags = BTreeSet::new();
    tags.insert(normalize_tag(&capture.content_kind));
    if let Some(source_app_name) = capture.source_app_name.as_deref() {
        let tag = normalize_tag(source_app_name);
        if !tag.is_empty() {
            tags.insert(tag);
        }
    }

    tags.into_iter().take(4).collect()
}

fn normalize_tag(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_whitespace() {
                '-'
            } else {
                character
            }
        })
        .filter(|character| character.is_alphanumeric() || *character == '-' || *character == '_')
        .collect::<String>()
}

fn default_confidence(disposition: BatchCompileDisposition) -> f64 {
    match disposition {
        BatchCompileDisposition::WriteTopic => 0.72,
        BatchCompileDisposition::WriteInbox => 0.48,
        BatchCompileDisposition::DiscardNoise => 0.95,
    }
}

fn select_background_compile_model(
    profile: &RuntimeProviderProfile,
    batch: &StoredBatchFile,
) -> SelectedModel {
    if profile.vendor != RuntimeProviderVendor::Deepseek {
        return SelectedModel {
            model: profile.effective_model(),
        };
    }

    SelectedModel {
        model: if is_complex_batch(batch) {
            DEFAULT_DEEPSEEK_REASONER_MODEL.into()
        } else {
            DEFAULT_DEEPSEEK_CHAT_MODEL.into()
        },
    }
}

fn build_source_label(profile: &RuntimeProviderProfile, model: &str) -> String {
    let provider_name = profile.name.trim();
    if provider_name.is_empty() {
        format!("{} · {model}", provider_vendor_label(profile.vendor))
    } else {
        format!("{provider_name} · {model}")
    }
}

fn provider_vendor_label(vendor: RuntimeProviderVendor) -> &'static str {
    match vendor {
        RuntimeProviderVendor::Openai => "OpenAI",
        RuntimeProviderVendor::Deepseek => "DeepSeek",
    }
}

fn capture_signal_hint(capture: &CaptureRecord) -> &'static str {
    if capture.content_kind == "link" {
        "reference_link"
    } else if is_weak_placeholder_capture(capture) {
        "weak_placeholder"
    } else {
        "knowledge_candidate"
    }
}

fn should_discard_locally_as_sensitive(capture: &CaptureRecord) -> bool {
    let trimmed = capture.raw_text.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.lines().count() == 1
        && (looks_like_prefixed_secret(trimmed)
            || looks_like_assignment_secret(trimmed)
            || looks_like_bearer_secret(trimmed)
            || looks_like_jwt(trimmed))
    {
        return true;
    }

    trimmed.lines().count() <= 3
        && trimmed.chars().count() <= 180
        && looks_like_assignment_secret(trimmed)
}

fn sanitize_capture_text_for_prompt(value: &str) -> String {
    let compact = sanitize_inline_markdown(value);
    let mut words = Vec::new();
    let mut previous_word = String::new();

    for word in compact.split(' ') {
        if word.is_empty() {
            continue;
        }

        words.push(sanitize_prompt_word(word, &previous_word));
        previous_word = word
            .trim_matches(|character: char| !character.is_alphanumeric())
            .to_lowercase();
    }

    words.join(" ")
}

fn sanitize_prompt_word(word: &str, previous_word: &str) -> String {
    let (prefix, core, suffix) = split_word_affixes(word);
    if previous_word == "bearer" && looks_like_prefixed_secret(core) {
        return format!("{prefix}[REDACTED_SECRET]{suffix}");
    }

    if let Some((key, separator, value)) = split_assignment_like(core) {
        if is_secret_field_key(key) && looks_like_prefixed_secret(value) {
            return format!("{prefix}{key}{separator}[REDACTED_SECRET]{suffix}");
        }
    }

    if looks_like_prefixed_secret(core) {
        return format!("{prefix}[REDACTED_SECRET]{suffix}");
    }

    word.to_string()
}

fn split_word_affixes(word: &str) -> (&str, &str, &str) {
    let start = word
        .char_indices()
        .find(|(_, character)| character.is_alphanumeric())
        .map(|(index, _)| index)
        .unwrap_or(word.len());
    let end = word
        .char_indices()
        .rev()
        .find(|(_, character)| character.is_alphanumeric())
        .map(|(index, character)| index + character.len_utf8())
        .unwrap_or(start);

    (&word[..start], &word[start..end], &word[end..])
}

fn split_assignment_like(value: &str) -> Option<(&str, char, &str)> {
    for separator in ['=', ':'] {
        if let Some((key, rest)) = value.split_once(separator) {
            let normalized_key = key.trim().trim_matches('"').trim_matches('\'');
            let normalized_value = rest.trim().trim_matches('"').trim_matches('\'');
            if !normalized_key.is_empty() && !normalized_value.is_empty() {
                return Some((normalized_key, separator, normalized_value));
            }
        }
    }

    None
}

fn is_secret_field_key(value: &str) -> bool {
    let normalized = value.trim().to_lowercase().replace('-', "_");

    matches!(
        normalized.as_str(),
        "apikey" | "api_key" | "token" | "secret" | "password" | "bearer" | "access_token"
    ) || normalized.ends_with("_api_key")
        || normalized.ends_with("_token")
        || normalized.ends_with("_secret")
        || normalized.ends_with("_password")
}

fn looks_like_assignment_secret(value: &str) -> bool {
    split_assignment_like(value)
        .map(|(key, _, secret_value)| {
            is_secret_field_key(key) && looks_like_prefixed_secret(secret_value)
        })
        .unwrap_or(false)
}

fn looks_like_bearer_secret(value: &str) -> bool {
    value
        .trim()
        .strip_prefix("Bearer ")
        .map(looks_like_prefixed_secret)
        .unwrap_or(false)
}

fn looks_like_prefixed_secret(value: &str) -> bool {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'');
    if trimmed.len() < 20 {
        return false;
    }

    let lowered = trimmed.to_lowercase();
    lowered.starts_with("sk-")
        || lowered.starts_with("ghp_")
        || lowered.starts_with("github_pat_")
        || lowered.starts_with("xoxb-")
        || lowered.starts_with("xoxp-")
        || lowered.starts_with("xoxs-")
}

fn looks_like_jwt(value: &str) -> bool {
    let segments = value.trim().split('.').collect::<Vec<_>>();
    if segments.len() != 3 {
        return false;
    }

    segments.iter().all(|segment| {
        segment.len() >= 8
            && segment.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
    })
}

fn strip_markdown_code_fence(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }

    let without_start = trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```JSON")
        .trim_start_matches("```");
    without_start.trim_end_matches("```").trim().to_string()
}

fn extract_message_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.to_string()),
        Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("");
            (!text.is_empty()).then_some(text)
        }
        _ => None,
    }
}

fn extract_provider_error_message(value: &str) -> Option<String> {
    let payload = serde_json::from_str::<Value>(value).ok()?;
    payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(|message| message.to_string())
}

#[cfg(test)]
mod tests {
    use crate::{
        ai::{
            batch_store::StoredBatchFile, contracts::BatchCompileDisposition,
            topic_index::TopicIndexEntry,
        },
        clipboard::types::CaptureRecord,
        locale::AppLocale,
        runtime_provider::{RuntimeProviderProfile, RuntimeProviderVendor},
    };

    use super::{
        normalize_provider_decisions, sanitize_capture_text_for_prompt,
        select_background_compile_model, should_discard_locally_as_sensitive,
    };

    fn sample_capture(id: &str, content_kind: &str, raw_text: &str) -> CaptureRecord {
        CaptureRecord {
            id: id.into(),
            source: "clipboard".into(),
            source_app_name: Some("Arc".into()),
            source_app_bundle_id: Some("company.thebrowser.Browser".into()),
            source_app_icon_path: None,
            captured_at: "2026-04-13T12:00:00+08:00".into(),
            content_kind: content_kind.into(),
            raw_text: raw_text.into(),
            raw_rich: None,
            raw_rich_format: None,
            link_url: (content_kind == "link").then(|| raw_text.to_string()),
            link_metadata: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: format!("hash-{id}"),
            image_bytes: None,
            source_app_icon_bytes: None,
        }
    }

    fn deepseek_profile() -> RuntimeProviderProfile {
        RuntimeProviderProfile {
            id: "provider_1".into(),
            name: "DeepSeek".into(),
            vendor: RuntimeProviderVendor::Deepseek,
            base_url: "https://api.deepseek.com/v1".into(),
            api_key: "sk-test-12345678901234567890".into(),
            model: "deepseek-chat".into(),
        }
    }

    #[test]
    fn complex_batches_use_reasoner() {
        let batch = StoredBatchFile {
            id: "batch_1".into(),
            status: "ready".into(),
            created_at: "2026-04-13T12:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 2,
            first_captured_at: "2026-04-13T12:00:00+08:00".into(),
            last_captured_at: "2026-04-13T12:01:00+08:00".into(),
            source_ids: vec!["cap_1".into(), "cap_2".into()],
            captures: vec![
                sample_capture("cap_1", "rich_text", "Line 1\nLine 2"),
                sample_capture("cap_2", "link", "https://example.com"),
            ],
        };

        assert_eq!(
            select_background_compile_model(&deepseek_profile(), &batch).model,
            "deepseek-reasoner"
        );
    }

    #[test]
    fn obvious_secret_captures_are_blocked_locally() {
        assert!(should_discard_locally_as_sensitive(&sample_capture(
            "cap_1",
            "plain_text",
            "sk-fa719df7654a4b9798b3391aa6b64603",
        )));
    }

    #[test]
    fn prompt_sanitizer_redacts_prefixed_secrets() {
        let sanitized = sanitize_capture_text_for_prompt(
            "export DEEPSEEK_API_KEY=sk-fa719df7654a4b9798b3391aa6b64603",
        );

        assert!(!sanitized.contains("sk-fa719df7654a4b9798b3391aa6b64603"));
        assert!(sanitized.contains("[REDACTED_SECRET]"));
    }

    #[test]
    fn low_confidence_topic_decisions_are_downgraded_to_inbox() {
        let batch = StoredBatchFile {
            id: "batch_1".into(),
            status: "ready".into(),
            created_at: "2026-04-13T12:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-13T12:00:00+08:00".into(),
            last_captured_at: "2026-04-13T12:00:00+08:00".into(),
            source_ids: vec!["cap_1".into()],
            captures: vec![sample_capture(
                "cap_1",
                "plain_text",
                "Rust owns trusted side effects.",
            )],
        };

        let decisions = normalize_provider_decisions(
            &batch,
            &[TopicIndexEntry {
                topic_slug: "rust-runtime".into(),
                topic_name: "Rust Runtime".into(),
                topic_summary: "Rust async runtime orchestration".into(),
                recent_tags: vec!["rust".into()],
                last_updated_at: "2026-04-12T12:00:00+08:00".into(),
            }],
            r#"{
              "decisions": [
                {
                  "sourceCaptureIds": ["cap_1"],
                  "disposition": "write_topic",
                  "topicSlug": "rust-runtime",
                  "topicName": "Rust Runtime",
                  "title": "Rust runtime",
                  "summary": "Runtime note",
                  "keyPoints": ["Rust owns side effects"],
                  "tags": ["rust"],
                  "confidence": 0.4,
                  "rationale": "weak overlap"
                }
              ]
            }"#,
            AppLocale::EnUs,
        )
        .expect("decisions should normalize");

        assert_eq!(decisions.len(), 1);
        assert_eq!(
            decisions[0].disposition,
            BatchCompileDisposition::WriteInbox
        );
    }

    #[test]
    fn zh_locale_prefers_localized_topic_name_even_when_slug_is_reused() {
        let batch = StoredBatchFile {
            id: "batch_2".into(),
            status: "ready".into(),
            created_at: "2026-04-14T12:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-14T12:00:00+08:00".into(),
            last_captured_at: "2026-04-14T12:00:00+08:00".into(),
            source_ids: vec!["cap_2".into()],
            captures: vec![sample_capture(
                "cap_2",
                "plain_text",
                "前端开发工程师二面记录：蒋庆，React、TypeScript、Zustand、AI 工具使用都比较成熟。",
            )],
        };

        let decisions = normalize_provider_decisions(
            &batch,
            &[],
            r#"{
              "decisions": [
                {
                  "sourceCaptureIds": ["cap_2"],
                  "disposition": "write_topic",
                  "topicSlug": "frontend-interview-eval-jq",
                  "topicName": "Frontend Interview Evaluation of Jiang Qing",
                  "title": "蒋庆前端面试技术评估",
                  "summary": "前端开发候选人蒋庆的面试记录。",
                  "keyPoints": ["React 知识考察"],
                  "tags": ["frontend", "interview"],
                  "confidence": 0.96,
                  "rationale": "durable interview knowledge"
                }
              ]
            }"#,
            AppLocale::ZhCn,
        )
        .expect("decisions should normalize");

        assert_eq!(decisions.len(), 1);
        assert_eq!(
            decisions[0].disposition,
            BatchCompileDisposition::WriteTopic
        );
        assert_eq!(
            decisions[0].topic_name.as_deref(),
            Some("蒋庆前端面试技术评估")
        );
        assert_eq!(
            decisions[0].topic_slug.as_deref(),
            Some("frontend-interview-eval-jq")
        );
    }

    #[test]
    fn en_locale_downgrades_topics_when_output_stays_in_chinese() {
        let batch = StoredBatchFile {
            id: "batch_2b".into(),
            status: "ready".into(),
            created_at: "2026-04-14T12:05:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-14T12:05:00+08:00".into(),
            last_captured_at: "2026-04-14T12:05:00+08:00".into(),
            source_ids: vec!["cap_2b".into()],
            captures: vec![sample_capture(
                "cap_2b",
                "plain_text",
                "前端开发工程师二面记录：蒋庆，React、TypeScript、Zustand、AI 工具使用都比较成熟。",
            )],
        };

        let decisions = normalize_provider_decisions(
            &batch,
            &[],
            r#"{
              "decisions": [
                {
                  "sourceCaptureIds": ["cap_2b"],
                  "disposition": "write_topic",
                  "topicSlug": "frontend-interview-eval-jq",
                  "topicName": "蒋庆前端面试评估",
                  "title": "蒋庆前端面试评估",
                  "summary": "前端开发候选人的面试记录。",
                  "keyPoints": ["React 知识考察"],
                  "tags": ["frontend", "interview"],
                  "confidence": 0.96,
                  "rationale": "durable interview knowledge"
                }
              ]
            }"#,
            AppLocale::EnUs,
        )
        .expect("decisions should normalize");

        assert_eq!(decisions.len(), 1);
        assert_eq!(
            decisions[0].disposition,
            BatchCompileDisposition::WriteInbox
        );
        assert!(decisions[0].topic_slug.is_none());
        assert!(decisions[0].topic_name.is_none());
    }

    #[test]
    fn single_blessing_text_is_not_promoted_to_topic() {
        let batch = StoredBatchFile {
            id: "batch_3".into(),
            status: "ready".into(),
            created_at: "2026-04-14T12:10:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-14T12:10:00+08:00".into(),
            last_captured_at: "2026-04-14T12:10:00+08:00".into(),
            source_ids: vec!["cap_3".into()],
            captures: vec![sample_capture(
                "cap_3",
                "plain_text",
                "愿你的人生幸福甜蜜，快乐平安，所有心愿都能顺利实现。",
            )],
        };

        let decisions = normalize_provider_decisions(
            &batch,
            &[],
            r#"{
              "decisions": [
                {
                  "sourceCaptureIds": ["cap_3"],
                  "disposition": "write_topic",
                  "topicSlug": "personal-inspiration",
                  "topicName": "Personal Inspiration and Motivational Quotes",
                  "title": "Chinese Motivational Life Message",
                  "summary": "Inspirational quote in Chinese about happiness and wisdom.",
                  "keyPoints": ["Promotes happiness and success"],
                  "tags": ["motivation"],
                  "confidence": 0.82,
                  "rationale": "durable personal knowledge"
                }
              ]
            }"#,
            AppLocale::ZhCn,
        )
        .expect("decisions should normalize");

        assert_eq!(decisions.len(), 1);
        assert_eq!(
            decisions[0].disposition,
            BatchCompileDisposition::WriteInbox
        );
        assert!(decisions[0].topic_slug.is_none());
        assert!(decisions[0].topic_name.is_none());
    }

    #[test]
    fn garbled_blessing_text_is_discarded_as_noise() {
        let batch = StoredBatchFile {
            id: "batch_4".into(),
            status: "ready".into(),
            created_at: "2026-04-14T12:20:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-14T12:20:00+08:00".into(),
            last_captured_at: "2026-04-14T12:20:00+08:00".into(),
            source_ids: vec!["cap_4".into()],
            captures: vec![sample_capture(
                "cap_4",
                "plain_text",
                "WH5M开垦一片快乐的土地，撒下一把幸福的种子，立春到了，只愿你的世界春光一片/🤡E‖费时?🉑",
            )],
        };

        let decisions = normalize_provider_decisions(
            &batch,
            &[],
            r#"{
              "decisions": [
                {
                  "sourceCaptureIds": ["cap_4"],
                  "disposition": "write_topic",
                  "topicSlug": "personal-inspiration",
                  "topicName": "Personal Inspiration and Motivational Quotes",
                  "title": "Chinese inspirational text for spring and happiness",
                  "summary": "A poetic message in Chinese expressing wishes for happiness.",
                  "keyPoints": ["Associated with the beginning of spring"],
                  "tags": ["inspiration"],
                  "confidence": 0.9,
                  "rationale": "strong semantic overlap"
                }
              ]
            }"#,
            AppLocale::ZhCn,
        )
        .expect("decisions should normalize");

        assert_eq!(decisions.len(), 1);
        assert_eq!(
            decisions[0].disposition,
            BatchCompileDisposition::DiscardNoise
        );
        assert!(decisions[0].topic_slug.is_none());
        assert!(decisions[0].topic_name.is_none());
    }
}
