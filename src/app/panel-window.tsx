import type { ReactNode } from "react"

import { ClipboardWindowPage } from "@/features/clipboard/clipboard-window-page"

type PanelWindowDefinition = {
  label: string
  render: () => ReactNode
}

const panelWindowDefinitions: PanelWindowDefinition[] = [
  {
    label: "clipboard",
    render: () => <ClipboardWindowPage />,
  },
]

export function PanelWindowContent({ label }: { label: string }) {
  const definition = panelWindowDefinitions.find((candidate) => candidate.label === label)
  return definition ? definition.render() : null
}
