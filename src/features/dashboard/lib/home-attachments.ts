import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { isTauriRuntime, resolveAssetUrl } from "@/lib/tauri";

export const HOME_ATTACHMENT_LIMIT = 9;
export const HOME_ATTACHMENT_WARNING_THRESHOLD = 6;

export type HomeAttachmentKind = "image" | "file";

export type HomeAttachmentSelectionMode = "image" | "file";

export type HomeAttachment = {
  id: string;
  kind: HomeAttachmentKind;
  name: string;
  badgeLabel: string;
  sourceKey: string;
  sourcePath: string | null;
  previewSrc: string | null;
  revokePreviewSrc: boolean;
};

export type PlannedHomeAttachmentAppend = {
  duplicateAttachments: HomeAttachment[];
  exceedsLimit: boolean;
  remainingSlots: number;
  uniqueIncomingAttachments: HomeAttachment[];
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

export async function pickHomeAttachments(
  mode: HomeAttachmentSelectionMode,
): Promise<HomeAttachment[]> {
  if (isTauriRuntime()) {
    const result = await openDialog({
      directory: false,
      multiple: true,
      filters:
        mode === "image"
          ? [
              {
                name: "Images",
                extensions: [...IMAGE_EXTENSIONS],
              },
            ]
          : undefined,
    });

    return createHomeAttachmentsFromPaths(normalizeDialogSelection(result));
  }

  const files = await pickFilesInBrowser({
    accept: mode === "image" ? "image/*" : undefined,
    multiple: true,
  });

  return createHomeAttachmentsFromFiles(files);
}

export function createHomeAttachmentsFromFiles(files: Iterable<File>): HomeAttachment[] {
  return Array.from(files)
    .filter((file) => file instanceof File)
    .map(createHomeAttachmentFromFile);
}

export function createHomeAttachmentsFromPaths(paths: Iterable<string>): HomeAttachment[] {
  const uniquePaths = new Set(
    Array.from(paths)
      .map((path) => path.trim())
      .filter(Boolean),
  );

  return Array.from(uniquePaths).map(createHomeAttachmentFromPath);
}

export function extractHomeAttachmentsFromDataTransfer(
  dataTransfer: DataTransfer | null,
): HomeAttachment[] {
  const files = extractFilesFromDataTransfer(dataTransfer);
  if (files.length > 0) {
    return createHomeAttachmentsFromFiles(files);
  }

  return createHomeAttachmentsFromPaths(extractPathsFromDataTransfer(dataTransfer));
}

function extractFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) {
    return [];
  }

  const filesFromList = Array.from(dataTransfer.files ?? []);
  const filesFromItems = Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);

  return dedupeFiles([...filesFromList, ...filesFromItems]);
}

export function hasFilesInDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  if ((dataTransfer.files?.length ?? 0) > 0) {
    return true;
  }

  if (Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")) {
    return true;
  }

  const types = Array.from(dataTransfer.types ?? []);
  return (
    types.includes("Files")
    || types.includes("text/uri-list")
    || types.includes("public.file-url")
  );
}

export function planHomeAttachmentAppend(
  currentAttachments: HomeAttachment[],
  incomingAttachments: HomeAttachment[],
): PlannedHomeAttachmentAppend {
  const duplicateAttachments: HomeAttachment[] = [];
  const seenSourceKeys = new Set(currentAttachments.map((attachment) => attachment.sourceKey));
  const uniqueIncomingAttachments: HomeAttachment[] = [];

  for (const attachment of incomingAttachments) {
    if (seenSourceKeys.has(attachment.sourceKey)) {
      duplicateAttachments.push(attachment);
      continue;
    }

    seenSourceKeys.add(attachment.sourceKey);
    uniqueIncomingAttachments.push(attachment);
  }

  const remainingSlots = Math.max(0, HOME_ATTACHMENT_LIMIT - currentAttachments.length);

  return {
    duplicateAttachments,
    exceedsLimit: uniqueIncomingAttachments.length > remainingSlots,
    remainingSlots,
    uniqueIncomingAttachments,
  };
}

export function disposeHomeAttachment(attachment: HomeAttachment) {
  if (attachment.revokePreviewSrc && attachment.previewSrc) {
    URL.revokeObjectURL(attachment.previewSrc);
  }
}

function normalizeDialogSelection(result: string | string[] | null): string[] {
  if (!result) {
    return [];
  }

  return Array.isArray(result) ? result : [result];
}

function createHomeAttachmentFromPath(path: string): HomeAttachment {
  const name = getFileName(path);
  const kind = resolveHomeAttachmentKind(name);

  return {
    id: createHomeAttachmentId(),
    kind,
    name,
    badgeLabel: getHomeAttachmentBadgeLabel(name, kind),
    sourceKey: path,
    sourcePath: path,
    previewSrc: kind === "image" ? resolveAssetUrl(path) : null,
    revokePreviewSrc: false,
  };
}

function createHomeAttachmentFromFile(file: File): HomeAttachment {
  const name = resolveHomeAttachmentFileName(file);
  const kind = resolveHomeAttachmentKind(name, file.type);
  const previewSrc = kind === "image" ? URL.createObjectURL(file) : null;

  return {
    id: createHomeAttachmentId(),
    kind,
    name,
    badgeLabel: getHomeAttachmentBadgeLabel(name, kind, file.type),
    sourceKey: `browser:${name}:${file.type}:${file.size}:${file.lastModified}`,
    sourcePath: null,
    previewSrc,
    revokePreviewSrc: Boolean(previewSrc),
  };
}

function resolveHomeAttachmentKind(fileName: string, mimeType?: string): HomeAttachmentKind {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  const extension = getFileExtension(fileName);
  return extension && IMAGE_EXTENSIONS.has(extension) ? "image" : "file";
}

function getHomeAttachmentBadgeLabel(
  fileName: string,
  kind: HomeAttachmentKind,
  mimeType?: string,
): string {
  const extension = getFileExtension(fileName);
  if (extension) {
    return extension.slice(0, 4).toUpperCase();
  }

  const mimeExtension = getExtensionFromMimeType(mimeType);
  if (mimeExtension) {
    return mimeExtension.slice(0, 4).toUpperCase();
  }

  return kind === "image" ? "IMG" : "FILE";
}

function resolveHomeAttachmentFileName(file: File) {
  const trimmedName = file.name.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const mimeExtension = getExtensionFromMimeType(file.type);
  const fallbackBase = file.type.startsWith("image/") ? "pasted-image" : "pasted-file";

  return mimeExtension ? `${fallbackBase}.${mimeExtension}` : fallbackBase;
}

function getFileName(path: string) {
  const normalizedPath = path.replaceAll("\\", "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

function getFileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(extensionIndex + 1).toLowerCase();
}

function createHomeAttachmentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `home-attachment-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeFiles(files: File[]) {
  const seenKeys = new Set<string>();

  return files.filter((file) => {
    const normalizedName = resolveHomeAttachmentFileName(file);
    const key = `${normalizedName}:${file.type}:${file.size}:${file.lastModified}`;
    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function extractPathsFromDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return [];
  }

  const uriPayloads = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("public.file-url"),
  ].filter(Boolean);

  const fileUrls = uriPayloads
    .flatMap((payload) => payload.split(/\r?\n/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !value.startsWith("#"))
    .filter((value) => value.startsWith("file://"));

  return fileUrls
    .map(fileUrlToPath)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
}

function fileUrlToPath(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "file:") {
      return null;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }

    return pathname;
  } catch {
    return null;
  }
}

function getExtensionFromMimeType(mimeType?: string) {
  switch (mimeType?.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
    case "text/markdown":
      return "md";
    case "text/plain":
      return "txt";
    default:
      return "";
  }
}

function pickFilesInBrowser({
  accept,
  multiple,
}: {
  accept?: string;
  multiple: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = accept ?? "";
    input.style.position = "fixed";
    input.style.left = "-9999px";

    let settled = false;

    const finalize = (files: File[]) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("focus", handleWindowFocus, true);
      input.remove();
      resolve(files);
    };

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        finalize(Array.from(input.files ?? []));
      }, 0);
    };

    input.addEventListener(
      "change",
      () => {
        finalize(Array.from(input.files ?? []));
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        finalize([]);
      },
      { once: true },
    );

    window.addEventListener("focus", handleWindowFocus, true);
    document.body.append(input);
    input.click();
  });
}
