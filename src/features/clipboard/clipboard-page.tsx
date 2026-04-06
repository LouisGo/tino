import { ClipboardBoardFeature } from "@/features/clipboard/components/clipboard-board-feature";

export function ClipboardPage() {
  return (
    <div className="app-scroll-area h-full overflow-y-auto">
      <div className="app-page-shell pb-[calc(var(--app-page-padding-block)+1rem)]">
        <div className="app-page-rail [--app-page-rail-base:58rem] [--app-page-rail-growth:22vw]">
          <ClipboardBoardFeature />
        </div>
      </div>
    </div>
  );
}
