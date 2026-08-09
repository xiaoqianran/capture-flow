import {
  shortcutChordFromEvent,
  shouldIgnoreShortcutEvent,
  type ShortcutKeyboardEvent,
} from "@capture-flow/core";

import type { ShortcutBinding, ShortcutRegisterOptions } from "./types";

export interface ShortcutEventTargetLike {
  addEventListener(
    type: string,
    listener: (event: ShortcutKeyboardEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: ShortcutKeyboardEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface RegisterShortcutRuntimeOptions extends ShortcutRegisterOptions {
  target?: ShortcutEventTargetLike;
  capture?: boolean;
  stopOnMatch?: boolean;
  onError?: (error: unknown) => void;
}

export function registerShortcutRuntime(
  bindings: readonly ShortcutBinding[],
  options: RegisterShortcutRuntimeOptions = {},
): () => void {
  const target = options.target;
  if (!target) throw new Error("registerShortcutRuntime requires a target EventTarget");
  const capture = options.capture !== false;
  const protectInput = options.protectInput !== false;
  const stopOnMatch = options.stopOnMatch !== false;
  const enabled = options.enabled !== false;

  const listener = (event: ShortcutKeyboardEvent): void => {
    if (protectInput && shouldIgnoreShortcutEvent(event, { enabled })) return;
    if (!protectInput && options.enabled === false) return;

    const chord = shortcutChordFromEvent(event);
    if (!chord) return;
    const binding = bindings.find((candidate) => candidate.chord === chord);
    if (!binding) return;

    if (stopOnMatch) {
      const native = event as unknown as {
        preventDefault?: () => void;
        stopImmediatePropagation?: () => void;
      };
      native.preventDefault?.();
      native.stopImmediatePropagation?.();
    }
    try {
      void Promise.resolve(binding.handler()).catch((error: unknown) => {
        options.onError?.(error);
      });
    } catch (error) {
      options.onError?.(error);
    }
  };

  target.addEventListener("keydown", listener, capture);
  return () => target.removeEventListener("keydown", listener, capture);
}
