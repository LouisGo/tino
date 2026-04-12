import type { TranslationKey } from "@/i18n";
import { isFileReferenceKind } from "@/features/clipboard/lib/clipboard-board";
import type { ClipboardCapture } from "@/types/shell";

export type ClipboardTextPreviewMode = "preview" | "raw_text" | "raw_rich";

type ClipboardTranslate = (
  key: TranslationKey<"clipboard">,
  options?: {
    defaultValue?: string;
    values?: Record<string, boolean | Date | null | number | string | undefined>;
  },
) => string;

export function resolveClipboardTextPreviewMode(
  capture: ClipboardCapture,
  mode: ClipboardTextPreviewMode | null | undefined,
) {
  const modes = getClipboardTextPreviewModes(capture);
  if (mode && modes.includes(mode)) {
    return mode;
  }

  return preferredClipboardTextPreviewMode(capture);
}

export function cycleClipboardTextPreviewMode(
  capture: ClipboardCapture,
  currentMode: ClipboardTextPreviewMode | null | undefined,
  direction: "next" | "previous",
) {
  const modes = getClipboardTextPreviewModes(capture);
  if (modes.length <= 1) {
    return resolveClipboardTextPreviewMode(capture, currentMode);
  }

  const resolvedCurrentMode = resolveClipboardTextPreviewMode(capture, currentMode);
  const currentIndex = modes.indexOf(resolvedCurrentMode);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    direction === "previous"
      ? (normalizedIndex - 1 + modes.length) % modes.length
      : (normalizedIndex + 1) % modes.length;

  return modes[nextIndex] ?? modes[0];
}

export function buildClipboardTextPreviewTabs(
  capture: ClipboardCapture,
  t: ClipboardTranslate,
) {
  return getClipboardTextPreviewModes(capture).map((mode) => ({
    label: getClipboardTextPreviewModeLabel(capture, mode, t),
    mode,
  }));
}

export function getClipboardTextPreviewModes(capture: ClipboardCapture) {
  const modes: ClipboardTextPreviewMode[] = [];
  const previewKind = getClipboardPreviewKind(capture);

  if (previewKind !== "text") {
    modes.push("preview");
  }

  if (capture.rawText.trim()) {
    modes.push("raw_text");
  }

  if (capture.rawRich?.trim()) {
    modes.push("raw_rich");
  }

  if (modes.length === 0) {
    modes.push("raw_text");
  }

  return modes;
}

export function getClipboardTextPreviewModeLabel(
  capture: ClipboardCapture,
  mode: ClipboardTextPreviewMode,
  t: ClipboardTranslate,
) {
  if (mode === "preview") {
    const previewKind = getClipboardPreviewKind(capture);
    return previewKind === "markdown"
      ? t("preview.tabs.markdown")
      : t("preview.tabs.richText");
  }

  if (mode === "raw_rich") {
    return capture.rawRichFormat === "html"
      ? t("preview.tabs.html")
      : t("preview.tabs.rawRich");
  }

  return getClipboardPreviewKind(capture) === "text"
    ? t("preview.tabs.raw")
    : t("preview.tabs.text");
}

export function normalizeMarkdownSource(input: string) {
  return input.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function canRenderHtmlPreview(capture: ClipboardCapture) {
  return capture.contentKind === "rich_text"
    && capture.rawRichFormat === "html"
    && Boolean(capture.rawRich?.trim());
}

export function canRenderMarkdownPreview(capture: ClipboardCapture) {
  if (
    capture.contentKind === "link"
    || capture.contentKind === "image"
    || isFileReferenceKind(capture.contentKind)
  ) {
    return false;
  }

  return looksLikeMarkdown(normalizeMarkdownSource(capture.rawText));
}

export function preferredClipboardTextPreviewMode(capture: ClipboardCapture): ClipboardTextPreviewMode {
  return getClipboardPreviewKind(capture) === "text" ? "raw_text" : "preview";
}

function getClipboardPreviewKind(capture: ClipboardCapture) {
  if (canRenderMarkdownPreview(capture)) {
    return "markdown";
  }

  if (canRenderHtmlPreview(capture)) {
    return "html";
  }

  return "text";
}

function looksLikeMarkdown(input: string) {
  const normalized = input.trim();
  if (!normalized) {
    return false;
  }

  return [
    /^#{1,6}\s/m,
    /^>\s/m,
    /^(-|\*|\+)\s/m,
    /^\d+\.\s/m,
    /```/,
    /\|.+\|/,
    /\[[^\]]+\]\([^)]+\)/,
    /(\*\*|__)[^*_]+(\*\*|__)/,
    /`[^`\n]+`/,
    /~~[^~]+~~/,
  ].some((pattern) => pattern.test(normalized));
}
