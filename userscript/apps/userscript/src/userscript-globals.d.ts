interface UserscriptRequestDetails {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "text" | "blob" | "arraybuffer" | "json" | "stream" | "document";
  onload(response: UserscriptResponse): void;
  onerror(error: unknown): void;
  onabort(): void;
  onprogress?: (response: UserscriptResponse) => void;
}

interface UserscriptResponse {
  status: number;
  responseText: string;
  responseHeaders?: string;
  response?: unknown;
}

declare const GM_getValue: ((key: string, fallback?: unknown) => unknown) | undefined;
declare const GM_setValue: ((key: string, value: unknown) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_xmlhttpRequest:
  | ((details: UserscriptRequestDetails) => { abort?: () => void })
  | undefined;
declare const GM_setClipboard: ((text: string) => void) | undefined;
declare const GM_addStyle: ((css: string) => void) | undefined;
declare const GM_info: { script?: { version?: string } } | undefined;
declare const unsafeWindow: Window | undefined;
