import { ClipboardBoardFeature } from "@/features/clipboard/components/clipboard-board-feature";

export function ClipboardPage() {
  return (
    <div className="app-scroll-area h-full overflow-y-auto pr-2">
      <div className="pb-8">
        <ClipboardBoardFeature />
      </div>
    </div>
  );
}
