import { useCallback, useEffect, useRef, useState } from "react";

import type { SettingsSectionId } from "@/features/settings/settings-sections";

const DEFAULT_SCROLL_OFFSET = 148;
const PROGRAMMATIC_SCROLL_IDLE_MS = 160;

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
  const pendingSectionIdRef = useRef<SettingsSectionId | null>(null);
  const pendingScrollTimeoutRef = useRef<number | null>(null);

  const syncActiveSection = useCallback((sectionId: SettingsSectionId | null) => {
    if (!sectionId) {
      return;
    }

    setActiveSectionId((current) => (current === sectionId ? current : sectionId));
  }, []);

  const clearPendingScrollTarget = useCallback(() => {
    pendingSectionIdRef.current = null;

    if (pendingScrollTimeoutRef.current) {
      window.clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }
  }, []);

  const finalizePendingScrollTarget = useCallback(() => {
    clearPendingScrollTarget();

    if (!scrollViewport) {
      return;
    }

    syncActiveSection(
      resolveActiveSection(sectionIds, scrollViewport, scrollOffset),
    );
  }, [clearPendingScrollTarget, scrollOffset, scrollViewport, sectionIds, syncActiveSection]);

  const schedulePendingScrollFinalization = useCallback(() => {
    if (!pendingSectionIdRef.current) {
      return;
    }

    if (pendingScrollTimeoutRef.current) {
      window.clearTimeout(pendingScrollTimeoutRef.current);
    }

    pendingScrollTimeoutRef.current = window.setTimeout(() => {
      pendingScrollTimeoutRef.current = null;
      finalizePendingScrollTarget();
    }, PROGRAMMATIC_SCROLL_IDLE_MS);
  }, [finalizePendingScrollTarget]);

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
      const pendingSectionId = pendingSectionIdRef.current;

      if (!nextActiveSection) {
        return;
      }

      if (pendingSectionId) {
        if (nextActiveSection === pendingSectionId) {
          clearPendingScrollTarget();
          syncActiveSection(pendingSectionId);
          return;
        }

        syncActiveSection(pendingSectionId);
        return;
      }

      syncActiveSection(nextActiveSection);
    };

    const scheduleUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(updateActiveSection);
    };

    const handleScroll = () => {
      if (pendingSectionIdRef.current) {
        schedulePendingScrollFinalization();
      }

      scheduleUpdate();
    };
    const handleUserScrollInterrupt = () => {
      if (!pendingSectionIdRef.current) {
        return;
      }

      finalizePendingScrollTarget();
    };

    scheduleUpdate();
    scrollViewport.addEventListener("scroll", handleScroll, { passive: true });
    scrollViewport.addEventListener("wheel", handleUserScrollInterrupt, { passive: true });
    scrollViewport.addEventListener("touchstart", handleUserScrollInterrupt, {
      passive: true,
    });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      scrollViewport.removeEventListener("scroll", handleScroll);
      scrollViewport.removeEventListener("wheel", handleUserScrollInterrupt);
      scrollViewport.removeEventListener("touchstart", handleUserScrollInterrupt);
      window.removeEventListener("resize", scheduleUpdate);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [
    clearPendingScrollTarget,
    finalizePendingScrollTarget,
    schedulePendingScrollFinalization,
    scrollOffset,
    scrollViewport,
    sectionIds,
    syncActiveSection,
  ]);

  useEffect(() => () => {
    clearPendingScrollTarget();
  }, [clearPendingScrollTarget]);

  const scrollToSection = useCallback(
    (
      sectionId: SettingsSectionId,
      options?: {
        behavior?: ScrollBehavior;
      },
    ) => {
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
      const nextTop = Math.max(0, top);

      syncActiveSection(sectionId);

      if (Math.abs(scrollViewport.scrollTop - nextTop) <= 1) {
        clearPendingScrollTarget();
        return;
      }

      pendingSectionIdRef.current = sectionId;
      schedulePendingScrollFinalization();
      scrollViewport.scrollTo({
        top: nextTop,
        behavior: options?.behavior ?? "smooth",
      });
    },
    [
      clearPendingScrollTarget,
      schedulePendingScrollFinalization,
      scrollOffset,
      scrollViewport,
      syncActiveSection,
    ],
  );

  return {
    activeSectionId,
    scrollToSection,
  };
}
