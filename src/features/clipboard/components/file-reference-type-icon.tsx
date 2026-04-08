import type { LucideProps } from "lucide-react";
import {
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileQuestionMark,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Presentation,
} from "lucide-react";

import type { FileReferenceIconKind } from "@/features/clipboard/lib/file-reference-preview";

export function FileReferenceTypeIcon({
  kind,
  ...props
}: {
  kind: FileReferenceIconKind;
} & LucideProps) {
  switch (kind) {
    case "image":
      return <FileImage {...props} />;
    case "video":
      return <FileVideoCamera {...props} />;
    case "audio":
      return <FileMusic {...props} />;
    case "pdf":
      return <FileText {...props} />;
    case "presentation":
      return <Presentation {...props} />;
    case "spreadsheet":
      return <FileSpreadsheet {...props} />;
    case "document":
      return <FileText {...props} />;
    case "markdown":
      return <FileCode {...props} />;
    case "code":
      return <FileCode {...props} />;
    case "archive":
      return <FileArchive {...props} />;
    case "unknown":
      return <FileQuestionMark {...props} />;
    default:
      return <FileQuestionMark {...props} />;
  }
}
