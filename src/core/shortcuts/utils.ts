import type {
  ShortcutBindingOverride,
  ShortcutDefaultBinding,
  ShortcutPlatform,
} from "@/core/shortcuts/types";

type ParsedAccelerator = {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
};

const modifierOrder = ["Control", "Alt", "Shift", "Command"] as const;

function normalizeModifierToken(token: string) {
  switch (token.toLowerCase()) {
    case "cmd":
    case "command":
    case "meta":
    case "super":
      return "Command";
    case "ctrl":
    case "control":
      return "Control";
    case "alt":
    case "option":
      return "Alt";
    case "shift":
      return "Shift";
    default:
      return null;
  }
}

function normalizeKeyToken(token: string) {
  switch (token.toLowerCase()) {
    case "comma":
    case ",":
      return "Comma";
    case "period":
    case ".":
      return "Period";
    case "slash":
    case "/":
      return "Slash";
    case "space":
      return "Space";
    case "esc":
    case "escape":
      return "Escape";
    case "enter":
    case "return":
      return "Enter";
    case "tab":
      return "Tab";
    case "backspace":
      return "Backspace";
    case "delete":
    case "del":
      return "Delete";
    case "up":
    case "arrowup":
      return "ArrowUp";
    case "down":
    case "arrowdown":
      return "ArrowDown";
    case "left":
    case "arrowleft":
      return "ArrowLeft";
    case "right":
    case "arrowright":
      return "ArrowRight";
    case "home":
      return "Home";
    case "end":
      return "End";
    case "pageup":
      return "PageUp";
    case "pagedown":
      return "PageDown";
    default:
      if (token.length === 1) {
        return token.toUpperCase();
      }

      return token;
  }
}

function parseAcceleratorToken(
  token: string,
  platform: ShortcutPlatform,
  parsed: ParsedAccelerator,
) {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }

  if (/^(cmdorctrl|cmdorcontrol|commandorcontrol|commandorctrl|mod)$/i.test(trimmed)) {
    if (platform === "macos") {
      parsed.meta = true;
    } else {
      parsed.ctrl = true;
    }
    return true;
  }

  const modifier = normalizeModifierToken(trimmed);
  if (modifier === "Command") {
    parsed.meta = true;
    return true;
  }
  if (modifier === "Control") {
    parsed.ctrl = true;
    return true;
  }
  if (modifier === "Alt") {
    parsed.alt = true;
    return true;
  }
  if (modifier === "Shift") {
    parsed.shift = true;
    return true;
  }

  if (!parsed.key) {
    parsed.key = normalizeKeyToken(trimmed);
    return true;
  }

  return false;
}

export function getShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") {
    return "browser";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) {
    return "macos";
  }
  if (userAgent.includes("win")) {
    return "windows";
  }
  if (userAgent.includes("linux")) {
    return "linux";
  }

  return "browser";
}

export function parseShortcutAccelerator(
  accelerator: string | null | undefined,
  platform: ShortcutPlatform,
) {
  const trimmed = accelerator?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed: ParsedAccelerator = {
    alt: false,
    ctrl: false,
    key: "",
    meta: false,
    shift: false,
  };

  const tokens = trimmed.split("+");
  const valid = tokens.every((token) => parseAcceleratorToken(token, platform, parsed));

  if (!valid || !parsed.key) {
    return null;
  }

  return parsed;
}

export function stringifyShortcutAccelerator(parsed: ParsedAccelerator) {
  const parts = modifierOrder.filter((modifier) =>
    modifier === "Command"
      ? parsed.meta
      : modifier === "Control"
        ? parsed.ctrl
        : modifier === "Alt"
          ? parsed.alt
          : parsed.shift);

  return [...parts, parsed.key].join("+");
}

export function normalizeShortcutAccelerator(
  accelerator: string | null | undefined,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutAccelerator(accelerator, platform);
  return parsed ? stringifyShortcutAccelerator(parsed) : accelerator?.trim() || null;
}

export function resolveDefaultShortcutBinding(
  binding: ShortcutDefaultBinding,
  platform: ShortcutPlatform,
) {
  if (typeof binding === "string") {
    return normalizeShortcutAccelerator(binding, platform);
  }

  return normalizeShortcutAccelerator(
    binding[platform] ?? binding.default ?? null,
    platform,
  );
}

export function matchesShortcutEvent(
  event: KeyboardEvent,
  accelerator: string,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutAccelerator(accelerator, platform);
  if (!parsed) {
    return false;
  }

  const eventKey = normalizeEventKey(event.key);
  return (
    parsed.alt === event.altKey
    && parsed.ctrl === event.ctrlKey
    && parsed.meta === event.metaKey
    && parsed.shift === event.shiftKey
    && parsed.key === eventKey
  );
}

function normalizeEventKey(key: string) {
  switch (key) {
    case ",":
      return "Comma";
    case ".":
      return "Period";
    case "/":
      return "Slash";
    case " ":
      return "Space";
    case "Esc":
      return "Escape";
    default:
      return normalizeKeyToken(key);
  }
}

export function keyboardEventToShortcutAccelerator(
  event: KeyboardEvent,
) {
  const key = normalizeEventKey(event.key);
  if (isModifierOnlyKey(key) || isNonTerminalShortcutKey(key)) {
    return null;
  }

  const parsed: ParsedAccelerator = {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    key,
    meta: event.metaKey,
    shift: event.shiftKey,
  };

  if (
    !parsed.meta
    && !parsed.ctrl
    && !parsed.alt
    && !parsed.shift
    && !isBareShortcutKeyAllowed(key)
  ) {
    return null;
  }

  return stringifyShortcutAccelerator(parsed);
}

export function isModifierOnlyKey(key: string) {
  return [
    "Alt",
    "AltGraph",
    "Command",
    "Control",
    "Fn",
    "FnLock",
    "Hyper",
    "Meta",
    "OS",
    "Shift",
    "Super",
    "Symbol",
    "SymbolLock",
  ].includes(key);
}

function isNonTerminalShortcutKey(key: string) {
  return [
    "Compose",
    "Dead",
    "Process",
    "Unidentified",
  ].includes(key);
}

function isBareShortcutKeyAllowed(key: string) {
  return [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Backspace",
    "Delete",
    "End",
    "Enter",
    "Escape",
    "Home",
    "PageDown",
    "PageUp",
    "Space",
    "Tab",
  ].includes(key);
}

export function formatShortcutAccelerator(
  accelerator: string | null | undefined,
  platform: ShortcutPlatform,
) {
  const parsed = parseShortcutAccelerator(accelerator, platform);
  if (!parsed) {
    return accelerator ? accelerator.split("+").map((part) => part.trim()).filter(Boolean) : [];
  }

  const parts: string[] = [];
  if (parsed.ctrl) {
    parts.push(platform === "macos" ? "⌃" : "Ctrl");
  }
  if (parsed.alt) {
    parts.push(platform === "macos" ? "⌥" : "Alt");
  }
  if (parsed.shift) {
    parts.push(platform === "macos" ? "⇧" : "Shift");
  }
  if (parsed.meta) {
    parts.push(platform === "macos" ? "⌘" : "Win");
  }
  parts.push(formatKeyLabel(parsed.key, platform));
  return parts;
}

function formatKeyLabel(key: string, platform: ShortcutPlatform) {
  switch (key) {
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "Escape":
      return platform === "macos" ? "⎋" : "Esc";
    case "Enter":
      return platform === "macos" ? "↩" : "Enter";
    case "Backspace":
      return platform === "macos" ? "⌫" : "Backspace";
    case "Delete":
      return platform === "macos" ? "⌦" : "Delete";
    case "Space":
      return "Space";
    case "Comma":
      return ",";
    case "Period":
      return ".";
    case "Slash":
      return "/";
    default:
      return key;
  }
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }

  if (element.closest("[data-shortcut-capture='true']")) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  return (
    tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || element.isContentEditable
    || element.closest("[contenteditable='true']") !== null
  );
}

export function resolveShortcutOverride(
  overrides: Record<string, ShortcutBindingOverride>,
  shortcutId: string,
) {
  return Object.prototype.hasOwnProperty.call(overrides, shortcutId)
    ? overrides[shortcutId]
    : undefined;
}
