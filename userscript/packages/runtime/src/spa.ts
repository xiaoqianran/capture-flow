/**
 * SPA navigation adapter (aligned with SubBatch v6 watch surface):
 * pushState / replaceState / popstate / hashchange / pageshow /
 * visibilitychange / low-frequency URL poll.
 */

export interface SpaHistoryLike {
  pushState: (...args: never[]) => unknown;
  replaceState: (...args: never[]) => unknown;
}

export interface SpaEventTargetLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
}

export interface SpaDocumentLike extends SpaEventTargetLike {
  visibilityState?: string;
}

export interface SpaWindowLike extends SpaEventTargetLike {
  history: SpaHistoryLike;
  location?: { href: string };
}

export interface InstallSpaNavigateOptions {
  historyWindow: SpaWindowLike;
  eventWindow?: SpaWindowLike;
  documentRef?: SpaDocumentLike | null;
  getHref?: () => string;
  pollIntervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface SpaNavigateHandle {
  check: () => void;
  dispose: () => void;
}

interface SharedHistoryPatch {
  originalPush: SpaHistoryLike["pushState"];
  originalReplace: SpaHistoryLike["replaceState"];
  wrappedPush: SpaHistoryLike["pushState"];
  wrappedReplace: SpaHistoryLike["replaceState"];
  callbacks: Set<() => void>;
}

const historyPatches = new WeakMap<SpaHistoryLike, SharedHistoryPatch>();

function subscribeHistoryPatch(
  history: SpaHistoryLike,
  callback: () => void,
): () => void {
  let patch = historyPatches.get(history);
  if (!patch) {
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    const callbacks = new Set<() => void>();
    const notify = (): void => {
      for (const subscriber of [...callbacks]) subscriber();
    };
    const wrappedPush: SpaHistoryLike["pushState"] = function wrappedPush(
      this: SpaHistoryLike,
      ...args: never[]
    ) {
      const result = originalPush.apply(this, args);
      notify();
      return result;
    };
    const wrappedReplace: SpaHistoryLike["replaceState"] = function wrappedReplace(
      this: SpaHistoryLike,
      ...args: never[]
    ) {
      const result = originalReplace.apply(this, args);
      notify();
      return result;
    };
    patch = {
      originalPush,
      originalReplace,
      wrappedPush,
      wrappedReplace,
      callbacks,
    };
    history.pushState = wrappedPush;
    history.replaceState = wrappedReplace;
    historyPatches.set(history, patch);
  }
  patch.callbacks.add(callback);
  return () => {
    const current = historyPatches.get(history);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size) return;
    if (history.pushState === current.wrappedPush) history.pushState = current.originalPush;
    if (history.replaceState === current.wrappedReplace) {
      history.replaceState = current.originalReplace;
    }
    historyPatches.delete(history);
  };
}

export function installSpaNavigateAdapter(
  options: InstallSpaNavigateOptions,
  listener: () => void,
): SpaNavigateHandle {
  const historyWindow = options.historyWindow;
  const eventWindow = options.eventWindow ?? historyWindow;
  const documentRef = options.documentRef ?? null;
  const getHref =
    options.getHref ??
    (() => String(historyWindow.location?.href || ""));
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let lastHref = getHref();
  let disposed = false;

  const emitIfChanged = (): void => {
    if (disposed) return;
    const href = getHref();
    if (href === lastHref) return;
    lastHref = href;
    listener();
  };

  const onPop = (): void => emitIfChanged();
  const onHash = (): void => emitIfChanged();
  const onPageShow = (): void => emitIfChanged();
  const onVis = (): void => {
    if (documentRef?.visibilityState === "visible") emitIfChanged();
  };

  const unsubHistory = subscribeHistoryPatch(historyWindow.history, emitIfChanged);
  eventWindow.addEventListener("popstate", onPop);
  eventWindow.addEventListener("hashchange", onHash);
  eventWindow.addEventListener("pageshow", onPageShow);
  documentRef?.addEventListener("visibilitychange", onVis);

  let timer: ReturnType<typeof setInterval> | null = null;
  if (pollIntervalMs > 0) {
    timer = setIntervalFn(emitIfChanged, pollIntervalMs);
  }

  return {
    check: emitIfChanged,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubHistory();
      eventWindow.removeEventListener("popstate", onPop);
      eventWindow.removeEventListener("hashchange", onHash);
      eventWindow.removeEventListener("pageshow", onPageShow);
      documentRef?.removeEventListener("visibilitychange", onVis);
      if (timer) clearIntervalFn(timer);
    },
  };
}
