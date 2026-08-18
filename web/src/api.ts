import type { AIJob, AIQueueStats, AIResponse, ContentPacket, DocumentSummary, Health, Job, Recipe } from "./types";

// Dev: Vite proxies /api → :8080. Prod (served by hub): same-origin API at root.
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "/api" : "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status} invalid JSON: ${text.slice(0, 160)}`);
  }
  if (!res.ok) {
    const err = data as { error_message?: string; error_code?: string };
    throw new Error(err?.error_message || err?.error_code || `${res.status} ${path}`);
  }
  return data as T;
}

export const api = {
  health: () => request<Health>("/health"),
  listJobs: (limit = 50) => request<Job[]>(`/jobs?limit=${limit}`),
  getJob: (id: string) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
  createJob: (url: string, task = "full_text") =>
    request<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify({ url, task }),
    }),
  listDocs: (limit = 50) => request<DocumentSummary[]>(`/docs?limit=${limit}`),
  getDoc: (id: string) => request<ContentPacket>(`/docs/${encodeURIComponent(id)}`),
  listRecipes: () => request<Recipe[]>("/recipes"),
  enqueueAi: (documentId: string, recipeId: string) =>
    request<AIJob>("/ai/jobs", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, recipe_id: recipeId }),
    }),
  listAiJobs: (limit = 50, status = "") =>
    request<AIJob[]>(`/ai/jobs?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`),
  getAiJob: (id: string) => request<AIJob>(`/ai/jobs/${encodeURIComponent(id)}`),
  aiQueue: () => request<AIQueueStats>("/ai/queue"),
  listDocAi: (documentId: string) =>
    request<AIResponse[]>(`/docs/${encodeURIComponent(documentId)}/ai`),
};
