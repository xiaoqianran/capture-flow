/** Keyboard event shape used by pure shortcut helpers (no DOM dependency). */
export interface ShortcutKeyboardEvent {
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  getModifierState?: (key: string) => boolean;
  target?: EventTarget | null;
}

export interface ShouldIgnoreShortcutOptions {
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as HTMLElement & { isContentEditable?: boolean; tagName?: string };
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * v6-style protection: ignore shortcuts while typing / IME / key-repeat / AltGraph.
 */
export function shouldIgnoreShortcutEvent(
  event: ShortcutKeyboardEvent,
  options: ShouldIgnoreShortcutOptions = {},
): boolean {
  if (options.enabled === false) return true;
  if (event.repeat) return true;
  if (event.isComposing) return true;
  if (event.getModifierState?.("AltGraph")) return true;
  if (isEditableTarget(event.target ?? null)) return true;
  return false;
}

function normalizeKey(event: ShortcutKeyboardEvent): string | null {
  const key = String(event.key || "").toLowerCase();
  if (!key || key === "shift" || key === "control" || key === "alt" || key === "meta") {
    return null;
  }
  if (key.length === 1) return key.toUpperCase();
  // Named keys
  const map: Record<string, string> = {
    escape: "Esc",
    " ": "Space",
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
  };
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Build chord string like `Alt+Shift+C` (SubBatch order: Ctrl/Meta, Alt, Shift, Key). */
export function shortcutChordFromEvent(event: ShortcutKeyboardEvent): string | null {
  const key = normalizeKey(event);
  if (!key) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push(event.metaKey && !event.ctrlKey ? "Meta" : "Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}
