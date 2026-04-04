import {
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  warn as tauriWarn,
} from "@tauri-apps/plugin-log";

import { isTauriRuntime } from "@/lib/tauri";

type RendererLogLevel = "debug" | "info" | "warn" | "error";

type Logger = {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

const nativeConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let rendererLoggingInstalled = false;

function serializeLogPart(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatLogMessage(scope: string | null, message: string, meta?: unknown) {
  const prefix = scope ? `[${scope}] ` : "";

  if (meta === undefined) {
    return `${prefix}${message}`;
  }

  return `${prefix}${message} ${serializeLogPart(meta)}`;
}

function writeToTauriLog(level: RendererLogLevel, message: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const promise =
    level === "debug"
      ? tauriDebug(message)
      : level === "info"
        ? tauriInfo(message)
        : level === "warn"
          ? tauriWarn(message)
          : tauriError(message);

  void promise.catch((error) => {
    nativeConsole.error("[logger] failed to write renderer log", error);
  });
}

function emitRendererLog(
  level: RendererLogLevel,
  consoleMethod: keyof typeof nativeConsole,
  args: unknown[],
) {
  nativeConsole[consoleMethod](...args);
  writeToTauriLog(level, args.map(serializeLogPart).join(" "));
}

function emitScopedLog(level: RendererLogLevel, scope: string, message: string, meta?: unknown) {
  const formatted = formatLogMessage(scope, message, meta);
  const consoleMethod =
    level === "debug"
      ? "debug"
      : level === "info"
        ? "info"
        : level === "warn"
          ? "warn"
          : "error";

  nativeConsole[consoleMethod](formatted);
  writeToTauriLog(level, formatted);
}

export function createRendererLogger(scope: string): Logger {
  return {
    debug: (message, meta) => emitScopedLog("debug", scope, message, meta),
    info: (message, meta) => emitScopedLog("info", scope, message, meta),
    warn: (message, meta) => emitScopedLog("warn", scope, message, meta),
    error: (message, meta) => emitScopedLog("error", scope, message, meta),
  };
}

export function installRendererLogging() {
  if (rendererLoggingInstalled) {
    return;
  }

  rendererLoggingInstalled = true;

  console.debug = (...args: unknown[]) => {
    emitRendererLog("debug", "debug", args);
  };
  console.info = (...args: unknown[]) => {
    emitRendererLog("info", "info", args);
  };
  console.log = (...args: unknown[]) => {
    emitRendererLog("info", "log", args);
  };
  console.warn = (...args: unknown[]) => {
    emitRendererLog("warn", "warn", args);
  };
  console.error = (...args: unknown[]) => {
    emitRendererLog("error", "error", args);
  };

  if (typeof window !== "undefined") {
    const bootLogger = createRendererLogger("renderer");

    window.addEventListener("error", (event) => {
      emitScopedLog(
        "error",
        "window",
        "Unhandled window error",
        event.error ?? event.message,
      );
    });

    window.addEventListener("unhandledrejection", (event) => {
      emitScopedLog("error", "window", "Unhandled promise rejection", event.reason);
    });

    bootLogger.info("Renderer logging initialized");
  }
}
