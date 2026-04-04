import { openExternalTarget } from "@/lib/tauri";

const BLOCKED_PROTOCOLS = new Set(["javascript:", "data:", "vbscript:"]);

export function resolveExternalLinkTarget(href: string) {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith("#")) {
    return null;
  }

  try {
    const resolvedUrl = new URL(
      trimmedHref,
      typeof window === "undefined" ? "https://localhost" : window.location.href,
    );

    if (BLOCKED_PROTOCOLS.has(resolvedUrl.protocol)) {
      return null;
    }

    return resolvedUrl.toString();
  } catch {
    return null;
  }
}

export async function openExternalLink(href: string) {
  const target = resolveExternalLinkTarget(href);
  if (!target) {
    return false;
  }

  await openExternalTarget(target);
  return true;
}

export function getExternalLinkTargetFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  return resolveExternalLinkTarget(anchor.getAttribute("href") ?? "");
}
