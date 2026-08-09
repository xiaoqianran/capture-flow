import type {
  CaptureFlowRuntime,
  NetworkRequest,
  NetworkResponse,
  ShortcutBinding,
  ShortcutRegisterOptions,
} from "./types";

export interface UserscriptHost {
  storageGet(key: string, fallback?: unknown): unknown | Promise<unknown>;
  storageSet(key: string, value: unknown): void | Promise<void>;
  storageRemove(key: string): void | Promise<void>;
  request(url: string, request?: NetworkRequest): Promise<NetworkResponse>;
  writeClipboard(text: string): void | Promise<void>;
  addStyle(css: string): void;
  pageWindow: Window;
  pageHref(): string;
  registerShortcuts(
    bindings: readonly ShortcutBinding[],
    options?: ShortcutRegisterOptions,
  ): () => void;
  onNavigate(listener: () => void): () => void;
  hubBaseUrl(): string;
  hubAvailable(): Promise<boolean>;
  hubSend<T>(path: string, init?: NetworkRequest): Promise<T>;
}

export function createUserscriptRuntime(host: UserscriptHost): CaptureFlowRuntime {
  return {
    storage: {
      async get<T>(key: string, fallback?: T): Promise<T> {
        const value = await host.storageGet(key, fallback);
        return (value === undefined ? fallback : value) as T;
      },
      async set<T>(key: string, value: T): Promise<void> {
        await host.storageSet(key, value);
      },
      async remove(key: string): Promise<void> {
        await host.storageRemove(key);
      },
    },
    network: {
      request(url: string, request?: NetworkRequest): Promise<NetworkResponse> {
        return host.request(url, request);
      },
      async json<T>(url: string, request?: NetworkRequest): Promise<T> {
        const response = await host.request(url, request);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        return JSON.parse(response.text) as T;
      },
    },
    clipboard: {
      async writeText(text: string): Promise<void> {
        await host.writeClipboard(text);
      },
    },
    style: {
      add(css: string): void {
        host.addStyle(css);
      },
    },
    shortcuts: {
      register(
        bindings: readonly ShortcutBinding[],
        options?: ShortcutRegisterOptions,
      ): () => void {
        return host.registerShortcuts(bindings, options);
      },
    },
    page: {
      href: () => host.pageHref(),
      window: () => host.pageWindow,
      onNavigate: (listener) => host.onNavigate(listener),
    },
    hub: {
      available: () => host.hubAvailable(),
      send: <T>(path: string, init?: NetworkRequest) => host.hubSend<T>(path, init),
      baseUrl: () => host.hubBaseUrl(),
    },
  };
}
