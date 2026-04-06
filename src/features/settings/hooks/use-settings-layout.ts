import { useEffect, useRef, useState } from "react"

const SECTION_GAP_OFFSET = 24

export function useSettingsLayout() {
  const stickyShellRef = useRef<HTMLDivElement | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null)
  const [contentInsetTop, setContentInsetTop] = useState(10)
  const [scrollOffset, setScrollOffset] = useState(120)

  useEffect(() => {
    if (typeof window === "undefined" || !stickyShellRef.current || !tabsRef.current) {
      return
    }

    const stickyShell = stickyShellRef.current
    const tabs = tabsRef.current
    const updateOffset = () => {
      setContentInsetTop(
        Math.max(0, stickyShell.offsetHeight - tabs.offsetHeight + 4),
      )
      setScrollOffset(tabs.offsetHeight + SECTION_GAP_OFFSET - 4)
    }

    updateOffset()

    const observer = new ResizeObserver(updateOffset)
    observer.observe(stickyShell)
    observer.observe(tabs)
    window.addEventListener("resize", updateOffset)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateOffset)
    }
  }, [])

  return {
    contentInsetTop,
    scrollOffset,
    scrollViewport,
    setScrollViewport,
    stickyShellRef,
    tabsRef,
  }
}
