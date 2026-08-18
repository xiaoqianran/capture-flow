import {
  DEFAULT_HUB_URL,
  DEFAULT_RECIPE_ID,
  STORAGE_KEYS,
  formatJobFailure,
  isTerminalJobStatus,
  type BrowserSnapshot,
  type DockSide,
} from "@capture-flow/core";
import type { CaptureFlowRuntime, NetworkRequest } from "@capture-flow/runtime";

export { DEFAULT_HUB_URL, DEFAULT_RECIPE_ID, formatJobFailure };

export interface HubSettings {
  hubUrl: string;
  autoAi: boolean;
  autoCapture: boolean;
  recipeId: string;
  panelOpen: boolean;
  dockSide: DockSide;
}

export interface CollectJob {
  id: string;
  status: string;
  target?: { url: string; task?: string };
  adapter?: string;
  collector?: string;
  document_id?: string;
  revision_id?: string;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
  trace?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AIJob {
  id: string;
  document_id: string;
  revision_id: string;
  recipe_id: string;
  model?: string;
  status: "queued" | "running" | "retry_wait" | "done" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  response_id?: string;
  error_message?: string;
}

export interface AIQueueStats {
  concurrency: number;
  queued: number;
  running: number;
  retry_wait: number;
  done: number;
  failed: number;
}

export interface CaptureReceipt {
  document_id: string;
  revision_id: string;
  deduped: boolean;
  ai_job?: AIJob;
  ai_error?: string;
}

export interface HealthInfo {
  status: string;
  time?: string;
  ai_configured?: boolean;
  capture_concurrency?: number;
  ai_queue?: AIQueueStats;
}

export interface AiResponse {
  id: string;
  document_id: string;
  revision_id?: string;
  recipe_id: string;
  model?: string;
  content_md?: string;
  created_at?: string;
}

export interface CaptureFlowHubClient {
  getSettings(): Promise<HubSettings>;
  saveSettings(partial: Partial<HubSettings>): Promise<HubSettings>;
  health(): Promise<HealthInfo>;
  available(): Promise<boolean>;
  captureSnapshot(
    snapshot: BrowserSnapshot,
    opts?: { autoAi?: boolean; recipeId?: string; model?: string },
  ): Promise<CaptureReceipt>;
  queueStats(): Promise<AIQueueStats>;
  getAIJob(id: string): Promise<AIJob>;
  queueAI(documentId: string, recipeId?: string, model?: string): Promise<AIJob>;
  createJob(url: string, task?: string): Promise<CollectJob>;
  getJob(id: string): Promise<CollectJob>;
  waitJob(
    id: string,
    opts?: {
      intervalMs?: number;
      timeoutMs?: number;
      onTick?: (job: CollectJob) => void;
      signal?: AbortSignal;
    },
  ): Promise<CollectJob>;
  runAi(documentId: string, recipeId?: string): Promise<AiResponse>;
  capturePage(
    url: string,
    opts?: { autoAi?: boolean; recipeId?: string; onTick?: (job: CollectJob) => void },
): Promise<{ job: CollectJob; aiJob?: AIJob }>;
}

function normalizeHubUrl(url: string): string {
  return String(url || DEFAULT_HUB_URL).replace(/\/$/, "");
}

export function createHubClient(runtime: CaptureFlowRuntime): CaptureFlowHubClient {
  async function getSettings(): Promise<HubSettings> {
    const [hubUrl, autoAi, autoCapture, recipeId, panelOpen, dockSide] = await Promise.all([
      runtime.storage.get(STORAGE_KEYS.hubUrl, DEFAULT_HUB_URL),
      runtime.storage.get(STORAGE_KEYS.autoAi, false),
      runtime.storage.get(STORAGE_KEYS.autoCapture, false),
      runtime.storage.get(STORAGE_KEYS.recipeId, DEFAULT_RECIPE_ID),
      runtime.storage.get(STORAGE_KEYS.panelOpen, true),
      runtime.storage.get(STORAGE_KEYS.dockSide, "right" as DockSide),
    ]);
    return {
      hubUrl: normalizeHubUrl(String(hubUrl)),
      autoAi: Boolean(autoAi),
      autoCapture: Boolean(autoCapture),
      recipeId: String(recipeId || DEFAULT_RECIPE_ID),
      panelOpen: Boolean(panelOpen),
      dockSide: dockSide === "left" ? "left" : "right",
    };
  }

  async function saveSettings(partial: Partial<HubSettings>): Promise<HubSettings> {
    if (partial.hubUrl !== undefined) {
      await runtime.storage.set(STORAGE_KEYS.hubUrl, normalizeHubUrl(partial.hubUrl));
    }
    if (partial.autoAi !== undefined) await runtime.storage.set(STORAGE_KEYS.autoAi, partial.autoAi);
    if (partial.autoCapture !== undefined) {
      await runtime.storage.set(STORAGE_KEYS.autoCapture, partial.autoCapture);
    }
    if (partial.recipeId !== undefined) await runtime.storage.set(STORAGE_KEYS.recipeId, partial.recipeId);
    if (partial.panelOpen !== undefined) await runtime.storage.set(STORAGE_KEYS.panelOpen, partial.panelOpen);
    if (partial.dockSide !== undefined) await runtime.storage.set(STORAGE_KEYS.dockSide, partial.dockSide);
    return getSettings();
  }

  async function hubJson<T>(path: string, init: NetworkRequest = {}): Promise<T> {
    const settings = await getSettings();
    const url = `${settings.hubUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await runtime.network.request(url, {
      fallback: "network-or-http",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    let data: unknown = null;
    try {
      data = response.text ? JSON.parse(response.text) : null;
    } catch {
      throw new Error(`invalid JSON from ${path}: ${response.text.slice(0, 160)}`);
    }
    if (!response.ok) {
      const err = data as { error_message?: string; error_code?: string };
      throw new Error(err?.error_message || err?.error_code || `HTTP ${response.status} ${path}`);
    }
    return data as T;
  }

  const client: CaptureFlowHubClient = {
    getSettings,
    saveSettings,
    health: () => hubJson<HealthInfo>("/health", { method: "GET", fallback: "network-or-http" }),
    available: async () => {
      try {
        const h = await hubJson<HealthInfo>("/health", { method: "GET" });
        return h.status === "ok";
      } catch {
        return false;
      }
    },
    captureSnapshot: async (snapshot, opts = {}) => {
      const settings = await getSettings();
      return hubJson<CaptureReceipt>("/captures", {
        method: "POST",
        body: JSON.stringify({
          ...snapshot,
          auto_ai: opts.autoAi ?? settings.autoAi,
          recipe_id: opts.recipeId ?? settings.recipeId,
          ...(opts.model ? { model: opts.model } : {}),
        }),
        fallback: "network-error",
      });
    },
    queueStats: () => hubJson<AIQueueStats>("/ai/queue", { method: "GET" }),
    getAIJob: (id: string) => hubJson<AIJob>(`/ai/jobs/${encodeURIComponent(id)}`, { method: "GET" }),
    queueAI: (documentId: string, recipeId = DEFAULT_RECIPE_ID, model?: string) =>
      hubJson<AIJob>("/ai/jobs", {
        method: "POST",
        body: JSON.stringify({
          document_id: documentId,
          recipe_id: recipeId,
          ...(model ? { model } : {}),
        }),
        fallback: "network-error",
      }),
    createJob: (url: string, task = "full_text") =>
      hubJson<CollectJob>("/jobs", {
        method: "POST",
        body: JSON.stringify({ url, task }),
        fallback: "network-error",
      }),
    getJob: (id: string) => hubJson<CollectJob>(`/jobs/${encodeURIComponent(id)}`, { method: "GET" }),
    waitJob: async (id, opts = {}) => {
      const intervalMs = opts.intervalMs ?? 600;
      const timeoutMs = opts.timeoutMs ?? 180_000;
      const started = Date.now();
      for (;;) {
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const job = await hubJson<CollectJob>(`/jobs/${encodeURIComponent(id)}`, {
          method: "GET",
          signal: opts.signal,
        });
        opts.onTick?.(job);
        if (isTerminalJobStatus(job.status)) return job;
        if (Date.now() - started > timeoutMs) {
          throw new Error(`timeout waiting for job ${id} (status=${job.status})`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
    runAi: (documentId: string, recipeId = DEFAULT_RECIPE_ID) =>
      hubJson<AiResponse>("/ai/run", {
        method: "POST",
        body: JSON.stringify({ document_id: documentId, recipe_id: recipeId }),
        fallback: "network-error",
      }),
    // URL-only OpenCLI path remains available as a compatibility/fallback API.
    capturePage: async (url, opts = {}) => {
      const settings = await getSettings();
      const jobQueued = await hubJson<CollectJob>("/jobs", {
        method: "POST",
        body: JSON.stringify({ url, task: "full_text" }),
        fallback: "network-error",
      });
      const job = await client.waitJob(jobQueued.id, { onTick: opts.onTick });
      if (job.status !== "done") throw new Error(formatJobFailure(job));
      const autoAi = opts.autoAi ?? settings.autoAi;
      const recipeId = opts.recipeId ?? settings.recipeId;
      if (autoAi && job.document_id) {
        const aiJob = await client.queueAI(job.document_id, recipeId);
        return { job, aiJob };
      }
      return { job };
    },
  };
  return client;
}
