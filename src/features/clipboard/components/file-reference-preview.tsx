import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  ExternalLink,
  FolderOpen,
  Pause,
  Play,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useCommand } from "@/core/commands";
import { FileReferenceTypeIcon } from "@/features/clipboard/components/file-reference-type-icon";
import { PreviewToolbar } from "@/features/clipboard/components/preview-toolbar";
import {
  isPreviewableFileReference,
  resolveFileReferencePreviewModel,
  type FileReferencePreviewKind,
  type FileReferencePreviewModel,
} from "@/features/clipboard/lib/file-reference-preview";
import { isTauriRuntime, resolveAssetUrl } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";

type FileReferenceFallbackTone = "default" | "missing" | "failed";

export function FileReferencePreview({
  capture,
  sharedSurface = false,
  toolbarMeta,
  toolbarActions,
}: {
  capture: ClipboardCapture;
  sharedSurface?: boolean;
  toolbarMeta?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const model = resolveFileReferencePreviewModel(capture);
  const previewSrc = resolveAssetUrl(model.path);
  const thumbnailSrc = capture.contentKind === "video"
    ? resolveAssetUrl(capture.thumbnailPath)
    : null;
  const previewStateKey = `${model.kind}:${model.path}:${previewSrc ?? ""}`;
  const [failedPreviewKey, setFailedPreviewKey] = useState<string | null>(null);
  const mediaLoadFailed = failedPreviewKey === previewStateKey;
  const usesPreviewableLayout = isPreviewableFileReference(model) && !mediaLoadFailed && Boolean(previewSrc);
  const canOpenInDefaultApp = isTauriRuntime() && !model.fileMissing && Boolean(model.path);
  const canRevealPath = !model.fileMissing && Boolean(model.path);
  const surfaceClassName = sharedSurface
    ? ""
    : model.surfaceVariant === "image"
      ? "app-preview-image"
      : "app-preview-file";

  return (
    <section className={cn(surfaceClassName, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden")}>
      <PreviewToolbar
        meta={toolbarMeta}
        controls={canOpenInDefaultApp || canRevealPath
          ? (
              <FileReferenceToolbarControls
                capture={capture}
                model={model}
                canOpenInDefaultApp={canOpenInDefaultApp}
                canRevealPath={canRevealPath}
              />
            )
          : undefined}
        actions={toolbarActions}
      />

      {usesPreviewableLayout && previewSrc ? (
        <PreviewableFileReferenceLayout
          capture={capture}
          model={model}
          previewSrc={previewSrc}
          thumbnailSrc={thumbnailSrc}
          onPreviewError={() => setFailedPreviewKey(previewStateKey)}
        />
      ) : (
        <GenericFileReferenceLayout
          capture={capture}
          model={model}
          tone={resolveFallbackTone(model, mediaLoadFailed)}
        />
      )}
    </section>
  );
}

function FileReferenceToolbarControls({
  capture,
  model,
  canOpenInDefaultApp,
  canRevealPath,
}: {
  capture: ClipboardCapture;
  model: FileReferencePreviewModel;
  canOpenInDefaultApp: boolean;
  canRevealPath: boolean;
}) {
  const openPathInDefaultApp = useCommand<{ path: string }>("system.openPathInDefaultApp");
  const revealCaptureAsset = useCommand<{ capture: ClipboardCapture; path: string }>("clipboard.revealCaptureAsset");

  return (
    <div className="flex items-center gap-1.5">
      {canOpenInDefaultApp ? (
        <button
          type="button"
          onClick={() => void openPathInDefaultApp.execute({ path: model.path })}
          className={cn(
            "app-preview-inline-action inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
            model.kind === "video" ? "app-kind-text-video" : "app-kind-text-file",
          )}
        >
          Open
          <ExternalLink className="size-3.5" />
        </button>
      ) : null}
      {canRevealPath ? (
        <button
          type="button"
          onClick={() =>
            void revealCaptureAsset.execute({
              capture,
              path: model.path,
            })}
          className={cn(
            "app-preview-inline-action inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
            model.kind === "video" ? "app-kind-text-video" : "app-kind-text-file",
          )}
        >
          Reveal
          <FolderOpen className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function PreviewableFileReferenceLayout({
  capture,
  model,
  previewSrc,
  thumbnailSrc,
  onPreviewError,
}: {
  capture: ClipboardCapture;
  model: FileReferencePreviewModel;
  previewSrc: string;
  thumbnailSrc?: string | null;
  onPreviewError: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 px-3 pb-3 pt-2">
      <div className={cn("flex h-full min-h-0 w-full overflow-hidden rounded-[22px] border border-border/55", previewStageShellClassName(model.kind))}>
        <FileReferenceInlineStage
          capture={capture}
          model={model}
          previewSrc={previewSrc}
          thumbnailSrc={thumbnailSrc}
          onPreviewError={onPreviewError}
        />
      </div>
    </div>
  );
}

function FileReferenceInlineStage({
  capture,
  model,
  previewSrc,
  thumbnailSrc,
  onPreviewError,
}: {
  capture: ClipboardCapture;
  model: FileReferencePreviewModel;
  previewSrc: string;
  thumbnailSrc?: string | null;
  onPreviewError: () => void;
}) {
  switch (model.kind) {
    case "image":
      return (
        <div className="flex size-full items-center justify-center p-3">
          <img
            src={previewSrc}
            alt={capture.preview || model.fileName || "Image file preview"}
            className="max-h-full max-w-full rounded-[18px] object-contain"
            onError={onPreviewError}
          />
        </div>
      );
    case "video":
      return (
        <VideoReferenceStage
          key={`${previewSrc}:${thumbnailSrc ?? ""}`}
          previewSrc={previewSrc}
          posterSrc={thumbnailSrc}
          title={capture.preview || model.fileName || "Video preview"}
          onPreviewError={onPreviewError}
        />
      );
    case "audio":
          return (
        <div className="flex size-full items-center justify-center p-4">
          <div className="flex w-full max-w-[34rem] flex-col items-center gap-5 rounded-[24px] border border-border/55 bg-card/84 px-6 py-7 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="inline-flex size-14 items-center justify-center rounded-[18px] border border-border/55 bg-background/78 text-muted-foreground/88">
              <FileReferenceTypeIcon kind="audio" className="size-6" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-foreground/90">
                {capture.preview || model.fileName || "Audio file"}
              </p>
              <p className="text-[11px] leading-5 text-muted-foreground/76">
                This local audio file plays inline from its saved path.
              </p>
            </div>
            <audio
              src={previewSrc}
              controls
              preload="metadata"
              className="w-full"
              onError={onPreviewError}
            />
          </div>
        </div>
      );
    case "pdf":
      return (
        <div className="size-full bg-white">
          <iframe
            title={`${model.fileName || "PDF document"} preview`}
            src={`${previewSrc}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className="size-full bg-white"
          />
        </div>
      );
    default:
      return null;
  }
}

function VideoReferenceStage({
  previewSrc,
  posterSrc,
  title,
  onPreviewError,
}: {
  previewSrc: string;
  posterSrc?: string | null;
  title: string;
  onPreviewError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const progressRatio = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      void video.play().catch(() => {
        onPreviewError();
      });
      return;
    }

    video.pause();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  function handleProgressClick(event: ReactMouseEvent<HTMLButtonElement>) {
    const video = videoRef.current;
    if (!video || duration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rawRatio = (event.clientX - rect.left) / rect.width;
    const nextRatio = Math.min(Math.max(rawRatio, 0), 1);
    const nextTime = duration * nextRatio;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="group relative flex size-full items-center justify-center overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={previewSrc}
        poster={posterSrc ?? undefined}
        playsInline
        preload="metadata"
        disablePictureInPicture
        className="size-full object-contain"
        aria-label={title}
        onClick={togglePlayback}
        onError={onPreviewError}
        onLoadedMetadata={(event) => {
          const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
          setDuration(nextDuration);
          setCurrentTime(event.currentTarget.currentTime || 0);
          setIsMuted(event.currentTarget.muted);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onVolumeChange={(event) => {
          setIsMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
        }}
      />

      {!isPlaying ? (
        <button
          type="button"
          onClick={togglePlayback}
          className="absolute inset-0 m-auto inline-flex size-[4.5rem] items-center justify-center rounded-full bg-black/56 text-white shadow-[0_24px_48px_rgba(0,0,0,0.38)] transition hover:bg-black/64"
          aria-label="Play video"
        >
          <Play className="ml-1 size-8 fill-current" />
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/68 via-black/28 to-transparent px-4 pb-4 pt-14">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[32rem] items-center gap-3 rounded-full border border-white/10 bg-black/52 px-3 py-2 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-md">
          <button
            type="button"
            onClick={togglePlayback}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/16"
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
          </button>

          <button
            type="button"
            onClick={handleProgressClick}
            className="relative h-2.5 min-w-0 flex-1 rounded-full bg-white/16"
            aria-label="Seek video"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white/82"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/16"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenericFileReferenceLayout({
  capture,
  model,
  tone,
}: {
  capture: ClipboardCapture;
  model: FileReferencePreviewModel;
  tone: FileReferenceFallbackTone;
}) {
  return (
    <div className="flex min-h-0 flex-1 px-3 pb-3 pt-2">
      <div className="flex h-full min-h-0 w-full items-start overflow-auto rounded-[22px] border border-dashed border-border/65 bg-card/48 p-5">
        <div className="flex w-full max-w-[28rem] flex-col items-start gap-4 text-left">
          <div
            className={cn(
              "inline-flex size-14 items-center justify-center rounded-[18px] border border-border/55 bg-background/76",
              model.kind === "video"
                ? "app-kind-text-video"
                : model.kind === "image"
                  ? "app-kind-text-image"
                  : "app-kind-text-file",
            )}
          >
            <FileReferenceTypeIcon kind={model.iconKind} className="size-6" />
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {model.contentTypeLabel}
            </p>
            <p className="break-all text-lg font-semibold leading-7 text-foreground/92">
              {capture.preview || model.fileName || "File reference"}
            </p>
            <p className="max-w-[26rem] text-sm leading-6 text-muted-foreground/80">
              {genericLayoutDescription(tone, model)}
            </p>
          </div>

          {tone === "missing" ? (
            <ReferenceWarning>
              The original file is no longer available at its saved path. This history entry stays visible, but open and reveal actions are disabled.
            </ReferenceWarning>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveFallbackTone(
  model: Pick<FileReferencePreviewModel, "fileMissing">,
  mediaLoadFailed: boolean,
): FileReferenceFallbackTone {
  if (model.fileMissing) {
    return "missing";
  }

  if (mediaLoadFailed) {
    return "failed";
  }

  return "default";
}

function previewStageShellClassName(kind: FileReferencePreviewKind) {
  switch (kind) {
    case "image":
      return "app-preview-image-stage bg-card/72";
    case "video":
      return "bg-card/78";
    case "pdf":
      return "bg-white";
    case "audio":
      return "bg-card/70";
    default:
      return "bg-card/74";
  }
}

function genericLayoutDescription(
  tone: FileReferenceFallbackTone,
  model: Pick<FileReferencePreviewModel, "contentTypeLabel" | "iconKind">,
) {
  if (tone === "missing") {
    return "The original local file is no longer available from its saved path.";
  }

  if (tone === "failed") {
    return "This file cannot be previewed inline right now. Reveal the original file to inspect it.";
  }

  switch (model.iconKind) {
    case "image":
      return "This image is stored as a local file reference.";
    case "video":
      return "This video is stored as a local file reference.";
    case "audio":
      return "This audio file is stored as a local file reference.";
    case "pdf":
      return "This document is stored as a local file reference.";
    case "presentation":
      return "This presentation is stored as a local file reference.";
    case "spreadsheet":
      return "This spreadsheet is stored as a local file reference.";
    case "document":
      return "This document is stored as a local file reference.";
    case "markdown":
      return "This Markdown file is stored as a local file reference.";
    case "code":
      return "This code file is stored as a local file reference.";
    case "archive":
      return `This ${model.contentTypeLabel.toLowerCase()} is stored as a local file reference.`;
    case "unknown":
      return "Tino could not identify this file type yet. Reveal the original file to inspect it.";
    default:
      return "This file type does not have an inline preview yet. Reveal the original file to inspect it.";
  }
}

function ReferenceWarning({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex max-w-full items-start gap-2 rounded-[16px] border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] leading-5 text-amber-700/90 dark:text-amber-200/88">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
