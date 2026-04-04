import { useQuery } from "@tanstack/react-query";

import { ClipboardBoardPanel } from "@/features/clipboard/components/clipboard-board-panel";
import { ClipboardBoardSummary } from "@/features/clipboard/components/clipboard-board-summary";
import { getDashboardSnapshot, isTauriRuntime } from "@/lib/tauri";

export function ClipboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard-snapshot"],
    queryFn: getDashboardSnapshot,
    refetchInterval: isTauriRuntime() ? 3_000 : false,
  });
  const captures = data?.recentCaptures ?? [];

  return (
    <div className="space-y-3">
      <ClipboardBoardSummary captures={captures} />
      <ClipboardBoardPanel captures={captures} />
    </div>
  );
}
