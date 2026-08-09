export interface StorageAdapter {
  get<T>(key: string, fallback?: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface NetworkRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  /**
   * `network-error` — privileged retry only when fetch never got a response.
   * `network-or-http` — also retry failed idempotent GET/HEAD/OPTIONS.
   * `never` — no GM fallback.
   */
  fallback?: "never" | "network-error" | "network-or-http";
  stream?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface NetworkResponse {
  status: number;
  ok: boolean;
  text: string;
  headers: Record<string, string>;
}

export interface NetworkAdapter {
  request(url: string, request?: NetworkRequest): Promise<NetworkResponse>;
  json<T>(url: string, request?: NetworkRequest): Promise<T>;
}

export interface ClipboardAdapter {
  writeText(text: string): Promise<void>;
}

export interface StyleAdapter {
  add(css: string): void;
}

export interface ShortcutBinding {
  chord: string;
  handler: () => void | Promise<void>;
}

export interface ShortcutRegisterOptions {
  enabled?: boolean;
  protectInput?: boolean;
}

export interface ShortcutAdapter {
  register(
    bindings: readonly ShortcutBinding[],
    options?: ShortcutRegisterOptions,
  ): () => void;
}

export interface PageAdapter {
  href(): string;
  window(): Window;
  onNavigate(listener: () => void): () => void;
}

export interface HubAdapter {
  available(): Promise<boolean>;
  /** Low-level path send; prefer @capture-flow/hub-client for typed APIs. */
  send<T>(path: string, init?: NetworkRequest): Promise<T>;
  baseUrl(): string;
}

export interface CaptureFlowRuntime {
  storage: StorageAdapter;
  network: NetworkAdapter;
  clipboard: ClipboardAdapter;
  style: StyleAdapter;
  shortcuts: ShortcutAdapter;
  page: PageAdapter;
  hub: HubAdapter;
}
