export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isMacOsTauriRuntime() {
  return (
    isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgent)
  );
}

export async function unwrapTauriResult<T>(
  result: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
) {
  const payload = await result;
  if (payload.status === "ok") {
    return payload.data;
  }

  throw new Error(payload.error);
}
