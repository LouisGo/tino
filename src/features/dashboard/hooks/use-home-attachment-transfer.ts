import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";

import { getCurrentWebview } from "@tauri-apps/api/webview";

import {
  createHomeAttachmentsFromPaths,
  extractHomeAttachmentsFromDataTransfer,
  hasFilesInDataTransfer,
  type HomeAttachment,
} from "@/features/dashboard/lib/home-attachments";
import { createRendererLogger } from "@/lib/logger";
import { isTauriRuntime } from "@/lib/tauri";

const logger = createRendererLogger("home.attachments");

export function useHomeAttachmentTransfer({
  onAttachments,
}: {
  onAttachments: (attachments: HomeAttachment[]) => void;
}) {
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const dragDepthRef = useRef(0);
  const onAttachmentsRef = useRef(onAttachments);

  useEffect(() => {
    onAttachmentsRef.current = onAttachments;
  }, [onAttachments]);

  function resetDragState() {
    dragDepthRef.current = 0;
    setIsDropTargetActive(false);
  }

  function publishAttachments(
    attachments: HomeAttachment[],
    source: "dom-drop" | "native-drop" | "paste",
  ) {
    if (attachments.length === 0) {
      logger.debug("Ignored empty attachment transfer", { source });
      return;
    }

    logger.info("Accepted home attachments", {
      count: attachments.length,
      source,
    });
    onAttachmentsRef.current(attachments);
  }

  useEffect(() => {
    const clearDragState = () => {
      resetDragState();
    };

    window.addEventListener("dragend", clearDragState, true);
    window.addEventListener("drop", clearDragState, true);
    window.addEventListener("blur", clearDragState);

    return () => {
      window.removeEventListener("dragend", clearDragState, true);
      window.removeEventListener("drop", clearDragState, true);
      window.removeEventListener("blur", clearDragState);
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    let isDisposed = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        switch (event.payload.type) {
          case "enter":
          case "over":
            setIsDropTargetActive(true);
            break;
          case "leave":
            resetDragState();
            break;
          case "drop":
            resetDragState();
            publishAttachments(
              createHomeAttachmentsFromPaths(event.payload.paths),
              "native-drop",
            );
            break;
        }
      })
      .then((dispose) => {
        if (isDisposed) {
          dispose();
          return;
        }

        unlisten = dispose;
        logger.info("Attached native home drag-drop listener");
      })
      .catch((error: unknown) => {
        logger.error("Failed to attach native home drag-drop listener", error);
      });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, []);

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFilesInDataTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropTargetActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFilesInDataTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    if (!isDropTargetActive) {
      setIsDropTargetActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFilesInDataTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDropTargetActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasFilesInDataTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();

    const attachments = extractHomeAttachmentsFromDataTransfer(event.dataTransfer);
    resetDragState();

    publishAttachments(attachments, "dom-drop");
  }

  function handlePasteCapture(event: ClipboardEvent<HTMLElement>) {
    const attachments = extractHomeAttachmentsFromDataTransfer(event.clipboardData);
    if (attachments.length === 0) {
      return;
    }

    event.preventDefault();
    publishAttachments(attachments, "paste");
  }

  return {
    isDropTargetActive,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    onPasteCapture: handlePasteCapture,
  };
}
