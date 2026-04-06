import { useState } from "react"

const SECTION_SCROLL_OFFSET = 24

export function useSettingsLayout() {
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null)

  return {
    scrollOffset: SECTION_SCROLL_OFFSET,
    scrollViewport,
    setScrollViewport,
  }
}
