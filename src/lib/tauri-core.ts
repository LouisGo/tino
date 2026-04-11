import type { IpcError as RustIpcError } from "@/bindings/tauri";

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

export class TauriCommandError extends Error {
  code: string;
  details: string | null;

  constructor(payload: { code: string; message: string; details?: string | null }) {
    super(payload.message);
    this.name = "TauriCommandError";
    this.code = payload.code;
    this.details = payload.details ?? null;
  }
}

function isTauriIpcErrorPayload(value: unknown): value is RustIpcError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<RustIpcError>;
  return typeof payload.code === "string" && typeof payload.message === "string";
}

function normalizeTauriError(error: unknown) {
  if (error instanceof TauriCommandError) {
    return error;
  }

  if (isTauriIpcErrorPayload(error)) {
    return new TauriCommandError(error);
  }

  if (error instanceof Error) {
    return new TauriCommandError({
      code: "internal_error",
      message: error.message || "Unknown Tauri command error",
    });
  }

  if (typeof error === "string" && error.trim()) {
    return new TauriCommandError({
      code: "internal_error",
      message: error.trim(),
    });
  }

  return new TauriCommandError({
    code: "internal_error",
    message: "Unknown Tauri command error",
  });
}

export function getTauriCommandErrorCode(error: unknown) {
  return error instanceof TauriCommandError ? error.code : null;
}

export async function unwrapTauriResult<T>(
  result: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
) {
  const payload = await result;
  if (payload.status === "ok") {
    return payload.data;
  }

  throw normalizeTauriError(payload.error);
}
