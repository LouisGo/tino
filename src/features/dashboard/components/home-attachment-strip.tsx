import { useState } from "react";

import { ImageIcon, X } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import type { HomeAttachment } from "@/features/dashboard/lib/home-attachments";
import { cn } from "@/lib/utils";

type HomeAttachmentStripProps = {
  attachments: HomeAttachment[];
  attachmentsLabel: string;
  removeLabel: string;
  countText?: string | null;
  countTone?: "default" | "limit";
  onRemove: (attachmentId: string) => void;
};

export function HomeAttachmentStrip({
  attachments,
  attachmentsLabel,
  removeLabel,
  countText = null,
  countTone = "default",
  onRemove,
}: HomeAttachmentStripProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="app-home-attachment-region" aria-label={attachmentsLabel}>
      <div className="app-home-attachment-strip">
        {attachments.map((attachment) => (
          <Tooltip
            key={attachment.id}
            placement="bottom"
            multiline
            className="app-home-attachment-tooltip"
            content={<HomeAttachmentTooltipContent attachment={attachment} />}
          >
            <div className={cn("app-home-attachment-card", `is-${attachment.kind}`)}>
              <button
                type="button"
                className="app-home-attachment-remove"
                aria-label={`${removeLabel}: ${attachment.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(attachment.id);
                }}
              >
                <X className="size-3" />
              </button>

              {attachment.kind === "image" ? (
                <HomeImageAttachmentPreview attachment={attachment} />
              ) : (
                <span className="app-home-attachment-file-preview" aria-hidden="true">
                  <span className="app-home-attachment-file-fold" />
                  <span className="app-home-attachment-file-extension">
                    {attachment.badgeLabel}
                  </span>
                </span>
              )}
            </div>
          </Tooltip>
        ))}

        {countText ? (
          <span
            className={cn("app-home-attachment-count", countTone === "limit" && "is-limit")}
            aria-live="polite"
          >
            {countText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HomeAttachmentTooltipContent({ attachment }: { attachment: HomeAttachment }) {
  return (
    <span className="app-home-attachment-tooltip-content">
      <span className="app-home-attachment-tooltip-badge">{attachment.badgeLabel}</span>
      <span className="app-home-attachment-tooltip-title">{attachment.name}</span>
    </span>
  );
}

function HomeImageAttachmentPreview({ attachment }: { attachment: HomeAttachment }) {
  const [previewFailed, setPreviewFailed] = useState(false);

  if (attachment.previewSrc && !previewFailed) {
    return (
      <img
        src={attachment.previewSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="app-home-attachment-image"
        onError={() => setPreviewFailed(true)}
      />
    );
  }

  return (
    <span className="app-home-attachment-image-fallback" aria-hidden="true">
      <ImageIcon className="size-4" />
    </span>
  );
}
