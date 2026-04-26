import {
  CollectionEmptyState,
  type CollectionEmptyStateTone,
} from "@/components/collection-empty-state";
import { useScopedT } from "@/i18n";

export type ClipboardEmptyStateTone = CollectionEmptyStateTone;

export function ClipboardEmptyState({
  title,
  description,
  onRetry,
  tone = "default",
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  tone?: ClipboardEmptyStateTone;
  className?: string;
}) {
  const t = useScopedT("clipboard");

  return (
    <CollectionEmptyState
      title={title}
      description={description}
      actionLabel={onRetry ? t("empty.retry") : undefined}
      onAction={onRetry}
      tone={tone}
      className={className}
    />
  );
}
