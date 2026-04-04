import { FileText, ImageIcon, Link2 } from "lucide-react";

import {
  captureListSummary,
  type ClipboardCaptureGroup,
} from "@/features/clipboard/lib/clipboard-board";
import { cn } from "@/lib/utils";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

import { ClipboardEmptyState } from "./clipboard-empty-state";

export function ClipboardCaptureList({
  groups,
  selectedCaptureId,
  onSelectCapture,
}: {
  groups: ClipboardCaptureGroup[];
  selectedCaptureId: string | null;
  onSelectCapture: (captureId: string) => void;
}) {
  const hasCaptures = groups.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-card/78">
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="space-y-3">
          {hasCaptures ? (
            groups.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <p className="px-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.captures.map((capture) => (
                    <button
                      key={capture.id}
                      type="button"
                      onClick={() => onSelectCapture(capture.id)}
                      className={cn(
                        "flex h-[50px] w-full items-center gap-3 rounded-[16px] border px-3 text-left transition",
                        selectedCaptureId === capture.id
                          ? "border-primary/25 bg-primary/10 shadow-sm"
                          : "border-transparent bg-background/55 hover:border-border/80 hover:bg-secondary/50",
                      )}
                    >
                      <CaptureThumb capture={capture} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {captureListSummary(capture)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <ClipboardEmptyState
              title="No matching captures"
              description="Try clearing the search term or switching the type filter back to all entries."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CaptureThumb({ capture }: { capture: ClipboardCapture }) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-[12px] bg-secondary/80 text-muted-foreground">
      {renderKindIcon(capture.contentKind, "size-4")}
    </div>
  );
}

function renderKindIcon(contentKind: ContentKind, className = "size-5") {
  switch (contentKind) {
    case "link":
      return <Link2 className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    default:
      return <FileText className={className} />;
  }
}
