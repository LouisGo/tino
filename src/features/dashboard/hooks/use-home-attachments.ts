import { useEffect, useRef, useState } from "react";

import { message } from "@tauri-apps/plugin-dialog";

import {
  createHomeAttachmentsFromFiles,
  disposeHomeAttachment,
  HOME_ATTACHMENT_LIMIT,
  planHomeAttachmentAppend,
  pickHomeAttachments,
  type HomeAttachment,
  type HomeAttachmentSelectionMode,
} from "@/features/dashboard/lib/home-attachments";
import { useScopedT } from "@/i18n";
import { isTauriRuntime } from "@/lib/tauri";

export function useHomeAttachments() {
  const tDashboard = useScopedT("dashboard");
  const [attachments, setAttachments] = useState<HomeAttachment[]>([]);
  const [isPickingAttachments, setIsPickingAttachments] = useState(false);
  const attachmentsRef = useRef<HomeAttachment[]>(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(disposeHomeAttachment);
    };
  }, []);

  async function showAttachmentLimitDialog() {
    const body = tDashboard("chat.attachmentsLimitDialogMessage", {
      values: { limit: HOME_ATTACHMENT_LIMIT },
    });
    if (!isTauriRuntime()) {
      window.alert(body);
      return;
    }

    await message(body, {
      title: tDashboard("chat.attachmentsLimitDialogTitle"),
      kind: "warning",
    });
  }

  function commitAttachments(incomingAttachments: HomeAttachment[]) {
    if (incomingAttachments.length === 0) {
      return;
    }

    const {
      duplicateAttachments,
      exceedsLimit,
      uniqueIncomingAttachments,
    } = planHomeAttachmentAppend(
      attachmentsRef.current,
      incomingAttachments,
    );

    if (exceedsLimit) {
      incomingAttachments.forEach(disposeHomeAttachment);
      void showAttachmentLimitDialog();
      return;
    }

    duplicateAttachments.forEach(disposeHomeAttachment);

    if (uniqueIncomingAttachments.length === 0) {
      return;
    }

    const nextAttachments = [...attachmentsRef.current, ...uniqueIncomingAttachments];
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
  }

  async function addAttachments(mode: HomeAttachmentSelectionMode) {
    if (isPickingAttachments || attachmentsRef.current.length >= HOME_ATTACHMENT_LIMIT) {
      if (!isPickingAttachments && attachmentsRef.current.length >= HOME_ATTACHMENT_LIMIT) {
        await showAttachmentLimitDialog();
      }
      return;
    }

    setIsPickingAttachments(true);

    try {
      const pickedAttachments = await pickHomeAttachments(mode);
      commitAttachments(pickedAttachments);
    } finally {
      setIsPickingAttachments(false);
    }
  }

  function appendAttachments(incomingAttachments: HomeAttachment[]) {
    commitAttachments(incomingAttachments);
  }

  function appendFiles(files: Iterable<File>) {
    appendAttachments(createHomeAttachmentsFromFiles(files));
  }

  function removeAttachment(attachmentId: string) {
    const removedAttachment = attachmentsRef.current.find(
      (attachment) => attachment.id === attachmentId,
    );
    if (!removedAttachment) {
      return;
    }

    const nextAttachments = attachmentsRef.current.filter(
      (attachment) => attachment.id !== attachmentId,
    );

    disposeHomeAttachment(removedAttachment);
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
  }

  return {
    attachments,
    isPickingAttachments,
    canAddAttachments: attachments.length < HOME_ATTACHMENT_LIMIT && !isPickingAttachments,
    addAttachments,
    appendAttachments,
    appendFiles,
    removeAttachment,
  };
}
