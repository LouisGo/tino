import { useEffect, useRef, useState } from "react";

import { FileText, ImageIcon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type HomeAttachmentPickerProps = {
  attachmentsLabel: string;
  imageLabel: string;
  fileLabel: string;
  disabled?: boolean;
  onPickImages: () => Promise<void> | void;
  onPickFiles: () => Promise<void> | void;
};

export function HomeAttachmentPicker({
  attachmentsLabel,
  imageLabel,
  fileLabel,
  disabled = false,
  onPickImages,
  onPickFiles,
}: HomeAttachmentPickerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        setMenuOpen(false);
        return;
      }

      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menuOpen]);

  async function handleMenuAction(action: () => Promise<void> | void) {
    setMenuOpen(false);
    await action();
  }

  return (
    <div className="relative flex shrink-0 items-center gap-2.5">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="app-home-utility-button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={attachmentsLabel}
        disabled={disabled}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <Plus className="size-4" />
      </Button>

      {menuOpen && !disabled ? (
        <div
          ref={menuRef}
          role="menu"
          className="app-home-attachment-menu absolute bottom-[calc(100%+0.625rem)] left-0 z-20 min-w-[12rem] rounded-[20px] p-1.5"
        >
          <button
            type="button"
            className="app-home-attachment-item flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm"
            onClick={() => {
              void handleMenuAction(onPickImages);
            }}
          >
            <span className="text-muted-foreground">
              <ImageIcon className="size-4" />
            </span>
            <span>{imageLabel}</span>
          </button>

          <button
            type="button"
            className="app-home-attachment-item flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm"
            onClick={() => {
              void handleMenuAction(onPickFiles);
            }}
          >
            <span className="text-muted-foreground">
              <FileText className="size-4" />
            </span>
            <span>{fileLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
