import { useCallback, useEffect, useState } from "react";

import type { SettingsSectionId } from "@/features/settings/settings-sections";

const DEFAULT_SCROLL_OFFSET = 148;

function resolveActiveSection(
  sectionIds: readonly SettingsSectionId[],
  scrollViewport: HTMLElement,
  scrollOffset: number,
) {
  let nextActiveSection = sectionIds[0] ?? null;
  const viewportTop = scrollViewport.getBoundingClientRect().top;

  for (const sectionId of sectionIds) {
    const element = document.getElementById(sectionId);
    if (!element) {
      continue;
    }

    if (element.getBoundingClientRect().top - viewportTop - scrollOffset <= 0) {
      nextActiveSection = sectionId;
      continue;
    }

    break;
  }

  return nextActiveSection;
}

export function useSettingsScrollSpy(
  sectionIds: readonly SettingsSectionId[],
  options?: {
    scrollViewport?: HTMLElement | null;
    scrollOffset?: number;
  },
) {
  const scrollOffset = options?.scrollOffset ?? DEFAULT_SCROLL_OFFSET;
  const scrollViewport = options?.scrollViewport ?? null;
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId | null>(
    sectionIds[0] ?? null,
  );

  useEffect(() => {
    if (!scrollViewport || sectionIds.length === 0 || typeof window === "undefined") {
      return;
    }

    let frame = 0;

    const updateActiveSection = () => {
      frame = 0;
      const nextActiveSection = resolveActiveSection(
        sectionIds,
        scrollViewport,
        scrollOffset,
      );

      if (!nextActiveSection) {
        return;
      }

      setActiveSectionId((current) =>
        current === nextActiveSection ? current : nextActiveSection,
      );
    };

    const scheduleUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(updateActiveSection);
    };

    scheduleUpdate();
    scrollViewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollViewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [scrollOffset, scrollViewport, sectionIds]);

  const scrollToSection = useCallback(
    (sectionId: SettingsSectionId) => {
      if (typeof window === "undefined" || !scrollViewport) {
        return;
      }

      const element = document.getElementById(sectionId);
      if (!element) {
        return;
      }

      setActiveSectionId(sectionId);
      const viewportTop = scrollViewport.getBoundingClientRect().top;
      const top =
        element.getBoundingClientRect().top
        - viewportTop
        + scrollViewport.scrollTop
        - scrollOffset;

      scrollViewport.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
    },
    [scrollOffset, scrollViewport],
  );

  return {
    activeSectionId,
    scrollToSection,
  };
}
