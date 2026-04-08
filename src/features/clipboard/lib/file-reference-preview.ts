import type { ClipboardCapture } from "@/types/shell";

export type FileReferencePreviewKind = "image" | "video" | "audio" | "pdf" | "generic";
export type FileReferenceIconKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "document"
  | "markdown"
  | "code"
  | "archive"
  | "unknown";
export type FileReferencePresentation = "previewable" | "generic";

type FileReferencePreviewStrategy = {
  kind: FileReferencePreviewKind;
  iconKind: FileReferenceIconKind;
  matches: (extension: string) => boolean;
  contentTypeLabel: string;
  presentation: FileReferencePresentation;
  inlinePreview: boolean;
  surfaceVariant: "image" | "file";
};

export type FileReferencePreviewModel = {
  kind: FileReferencePreviewKind;
  iconKind: FileReferenceIconKind;
  path: string;
  fileName: string;
  extension: string;
  extensionLabel: string | null;
  fileMissing: boolean;
  contentTypeLabel: string;
  presentation: FileReferencePresentation;
  inlinePreview: boolean;
  surfaceVariant: "image" | "file";
};

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const VIDEO_EXTENSIONS = new Set([
  "3gp",
  "asf",
  "avi",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "ogm",
  "ogv",
  "qt",
  "ts",
  "vob",
  "webm",
  "wmv",
]);

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "aif",
  "aiff",
  "caf",
  "flac",
  "m4a",
  "m4b",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
]);

const PRESENTATION_EXTENSIONS = new Set([
  "key",
  "odp",
  "ppt",
  "pptx",
]);

const SPREADSHEET_EXTENSIONS = new Set([
  "csv",
  "numbers",
  "ods",
  "tsv",
  "xls",
  "xlsx",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "odt",
  "pages",
  "rtf",
  "txt",
]);

const MARKDOWN_EXTENSIONS = new Set([
  "markdown",
  "md",
  "mdx",
]);

const CODE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "css",
  "cts",
  "cxx",
  "env",
  "fish",
  "go",
  "h",
  "hpp",
  "htm",
  "html",
  "hxx",
  "ini",
  "java",
  "js",
  "json",
  "jsonc",
  "jsx",
  "kt",
  "kts",
  "less",
  "lua",
  "mjs",
  "mts",
  "php",
  "pl",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

const PACKAGE_EXTENSIONS = new Set([
  "dmg",
  "iso",
  "pkg",
]);

const ARCHIVE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "gz",
  "rar",
  "tar",
  "tbz2",
  "tgz",
  "txz",
  "xz",
  "zip",
]);

const FILE_REFERENCE_PREVIEW_STRATEGIES: FileReferencePreviewStrategy[] = [
  {
    kind: "image",
    iconKind: "image",
    matches: (extension) => IMAGE_EXTENSIONS.has(extension),
    contentTypeLabel: "Image File",
    presentation: "previewable",
    inlinePreview: true,
    surfaceVariant: "image",
  },
  {
    kind: "video",
    iconKind: "video",
    matches: (extension) => VIDEO_EXTENSIONS.has(extension),
    contentTypeLabel: "Video",
    presentation: "previewable",
    inlinePreview: true,
    surfaceVariant: "file",
  },
  {
    kind: "audio",
    iconKind: "audio",
    matches: (extension) => AUDIO_EXTENSIONS.has(extension),
    contentTypeLabel: "Audio File",
    presentation: "previewable",
    inlinePreview: true,
    surfaceVariant: "file",
  },
  {
    kind: "pdf",
    iconKind: "pdf",
    matches: (extension) => extension === "pdf",
    contentTypeLabel: "PDF Document",
    presentation: "previewable",
    inlinePreview: true,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "presentation",
    matches: (extension) => PRESENTATION_EXTENSIONS.has(extension),
    contentTypeLabel: "Presentation",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "spreadsheet",
    matches: (extension) => SPREADSHEET_EXTENSIONS.has(extension),
    contentTypeLabel: "Spreadsheet",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "document",
    matches: (extension) => DOCUMENT_EXTENSIONS.has(extension),
    contentTypeLabel: "Document",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "markdown",
    matches: (extension) => MARKDOWN_EXTENSIONS.has(extension),
    contentTypeLabel: "Markdown",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "code",
    matches: (extension) => CODE_EXTENSIONS.has(extension),
    contentTypeLabel: "Code File",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "archive",
    matches: (extension) => PACKAGE_EXTENSIONS.has(extension),
    contentTypeLabel: "Package",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
  {
    kind: "generic",
    iconKind: "archive",
    matches: (extension) => ARCHIVE_EXTENSIONS.has(extension),
    contentTypeLabel: "Archive",
    presentation: "generic",
    inlinePreview: false,
    surfaceVariant: "file",
  },
];

const GENERIC_FILE_REFERENCE_PREVIEW_STRATEGY: FileReferencePreviewStrategy = {
  kind: "generic",
  iconKind: "unknown",
  matches: () => true,
  contentTypeLabel: "Unknown File Type",
  presentation: "generic",
  inlinePreview: false,
  surfaceVariant: "file",
};

export function isFileReferenceContentKind(contentKind: string) {
  return contentKind === "file" || contentKind === "video";
}

export function getFileReferencePath(
  capture: Pick<ClipboardCapture, "contentKind" | "rawText">,
) {
  return isFileReferenceContentKind(capture.contentKind)
    ? capture.rawText.trim()
    : "";
}

export function resolveFileReferencePreviewModel(
  capture: Pick<ClipboardCapture, "contentKind" | "rawText" | "fileMissing">,
): FileReferencePreviewModel {
  const path = getFileReferencePath(capture);
  const extension = getFileExtension(path);
  const strategy = resolveFileReferencePreviewStrategy(capture.contentKind, extension);
  const fileName = getFileName(path);

  return {
    kind: strategy.kind,
    iconKind: strategy.iconKind,
    path,
    fileName,
    extension,
    extensionLabel: extension ? extension.slice(0, 4).toUpperCase() : null,
    fileMissing: Boolean(capture.fileMissing),
    contentTypeLabel: strategy.contentTypeLabel,
    presentation: strategy.presentation,
    inlinePreview: strategy.inlinePreview && !capture.fileMissing && Boolean(path),
    surfaceVariant: strategy.surfaceVariant,
  };
}

export function isPreviewableFileReference(
  model: Pick<FileReferencePreviewModel, "presentation" | "inlinePreview" | "fileMissing">,
) {
  return model.presentation === "previewable" && model.inlinePreview && !model.fileMissing;
}

function resolveFileReferencePreviewStrategy(contentKind: string, extension: string) {
  if (contentKind === "video") {
    return FILE_REFERENCE_PREVIEW_STRATEGIES.find((strategy) => strategy.kind === "video")
      ?? GENERIC_FILE_REFERENCE_PREVIEW_STRATEGY;
  }

  return (
    FILE_REFERENCE_PREVIEW_STRATEGIES.find((strategy) => strategy.matches(extension))
    ?? GENERIC_FILE_REFERENCE_PREVIEW_STRATEGY
  );
}

function getFileName(path: string) {
  const normalized = path.trim().replaceAll("\\", "/");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function getFileExtension(path: string) {
  const fileName = getFileName(path);
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(extensionIndex + 1).toLowerCase();
}
