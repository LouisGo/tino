export function resolvePortalContainer() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector<HTMLElement>("[data-panel-window-root='true']") ?? document.body;
}
