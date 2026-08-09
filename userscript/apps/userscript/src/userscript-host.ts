import { DEFAULT_HUB_URL, STORAGE_KEYS } from "@capture-flow/core";
import {
  installSpaNavigateAdapter,
  registerShortcutRuntime,
  type NetworkRequest,
  type NetworkResponse,
  type ShortcutBinding,
  type ShortcutRegisterOptions,
  type UserscriptHost,
} from "@capture-flow/runtime";

function parseResponseHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

class FetchNetworkError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "FetchNetworkError";
    this.cause = cause;
  }
}

async function fetchRequest(
  pageWindow: Window,
  url: string,
  request: NetworkRequest = {},
): Promise<NetworkResponse> {
  let response: Response;
  try {
    const fetchFn = pageWindow.fetch || fetch;
    response = await fetchFn.call(pageWindow, url, {
      ...(request.method ? { method: request.method } : {}),
      ...(request.headers ? { headers: request.headers } : {}),
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.credentials ? { credentials: request.credentials } : {}),
      ...(request.cache ? { cache: request.cache } : {}),
    });
  } catch (error) {
    throw new FetchNetworkError(error);
  }
  const headers = Object.fromEntries(response.headers.entries());
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    text,
    headers,
  };
}

function privilegedRequest(url: string, request: NetworkRequest = {}): Promise<NetworkResponse> {
  if (typeof GM_xmlhttpRequest !== "function") {
    return Promise.reject(new Error("GM_xmlhttpRequest is unavailable"));
  }
  if (request.signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const handle: { current?: { abort?: () => void } } = {};
    const onAbort = (): void => {
      try {
        handle.current?.abort?.();
      } catch {
        /* ignore */
      }
      fail(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = (): void => request.signal?.removeEventListener("abort", onAbort);
    const finish = (response: NetworkResponse): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });
    handle.current = GM_xmlhttpRequest({
      url,
      ...(request.method ? { method: request.method } : {}),
      ...(request.headers ? { headers: request.headers } : {}),
      ...(request.body !== undefined ? { data: request.body } : {}),
      onload: (response) => {
        finish({
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          text: String(response.responseText || ""),
          headers: parseResponseHeaders(response.responseHeaders),
        });
      },
      onerror: (error) => fail(error),
      onabort: () => fail(new DOMException("Aborted", "AbortError")),
    });
  });
}

function mayRetryHttpFailure(request: NetworkRequest): boolean {
  if (request.fallback !== "network-or-http") return false;
  const method = String(request.method || "GET").toUpperCase();
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function resolvePageWindow(): Window {
  return typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
}

function pageHrefOf(pageWindow: Window): string {
  try {
    return String(pageWindow.location?.href || location.href);
  } catch {
    return location.href;
  }
}

function onNavigate(listener: () => void): () => void {
  const pageWindow = resolvePageWindow();
  const handle = installSpaNavigateAdapter(
    {
      historyWindow: pageWindow,
      eventWindow: pageWindow,
      documentRef: document,
      getHref: () => pageHrefOf(pageWindow),
      pollIntervalMs: 2000,
    },
    listener,
  );
  return () => handle.dispose();
}

function readHubBaseFromStorage(): string {
  try {
    if (typeof GM_getValue === "function") {
      const v = GM_getValue(STORAGE_KEYS.hubUrl, DEFAULT_HUB_URL);
      return String(v || DEFAULT_HUB_URL).replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_HUB_URL;
}

export function createUserscriptHost(): UserscriptHost {
  const pageWindow = resolvePageWindow();
  return {
    storageGet: (key, fallback) =>
      typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback,
    storageSet: (key, value) => {
      if (typeof GM_setValue === "function") GM_setValue(key, value);
    },
    storageRemove: (key) => {
      if (typeof GM_deleteValue === "function") GM_deleteValue(key);
    },
    request: async (url, request) => {
      try {
        const response = await fetchRequest(pageWindow, url, request);
        if (!response.ok && mayRetryHttpFailure(request ?? {})) {
          return privilegedRequest(url, request);
        }
        return response;
      } catch (error) {
        if (request?.signal?.aborted) throw error;
        if (error instanceof FetchNetworkError && request?.fallback !== "never") {
          return privilegedRequest(url, request);
        }
        throw error;
      }
    },
    writeClipboard: async (text) => {
      if (typeof GM_setClipboard === "function") GM_setClipboard(text);
      else await navigator.clipboard.writeText(text);
    },
    addStyle: (css) => {
      if (typeof GM_addStyle === "function") {
        GM_addStyle(css);
        return;
      }
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    },
    pageWindow,
    pageHref: () => pageHrefOf(pageWindow),
    registerShortcuts: (bindings, options = {}) =>
      registerShortcutRuntime(bindings as readonly ShortcutBinding[], {
        ...options,
        target: document,
        capture: true,
        stopOnMatch: true,
      }),
    onNavigate,
    hubBaseUrl: () => readHubBaseFromStorage(),
    hubAvailable: async () => {
      try {
        const base = readHubBaseFromStorage();
        const res = await privilegedRequest(`${base}/health`, {
          method: "GET",
          fallback: "never",
        });
        if (!res.ok) return false;
        const data = JSON.parse(res.text) as { status?: string };
        return data.status === "ok";
      } catch {
        return false;
      }
    },
    hubSend: async <T>(path: string, init: NetworkRequest = {}): Promise<T> => {
      const base = readHubBaseFromStorage();
      const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
      const res = await privilegedRequest(url, {
        fallback: "never",
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(`Hub HTTP ${res.status}: ${path}`);
      return JSON.parse(res.text) as T;
    },
  };
}
