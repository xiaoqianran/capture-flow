export type Job = {
  id: string;
  status: string;
  target: { url: string; task?: string };
  adapter?: string;
  collector?: string;
  document_id?: string;
  revision_id?: string;
  error_code?: string;
  error_message?: string;
  recoverable?: boolean;
  trace?: string[];
  created_at: string;
  updated_at: string;
};

export type DocumentSummary = {
  document_id: string;
  revision_id: string;
  source: string;
  type: string;
  url: string;
  title: string;
  author: string;
  collector: string;
  adapter: string;
  content_hash: string;
  schema_version: string;
  captured_at: string;
  updated_at: string;
};

export type ContentPacket = DocumentSummary & {
  content_md: string;
  content_raw: string;
  adapter_version: string;
};

export type Recipe = {
  id: string;
  name: string;
  description?: string;
};

export type AIResponse = {
  id: string;
  document_id: string;
  revision_id: string;
  recipe_id: string;
  model: string;
  content_md: string;
  created_at: string;
};

export type AIJob = {
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
};

export type AIQueueStats = {
  concurrency: number;
  queued: number;
  running: number;
  retry_wait: number;
  done: number;
  failed: number;
};

export type Health = {
  status: string;
  time: string;
  ai_configured: boolean;
  capture_concurrency?: number;
  ai_queue?: AIQueueStats;
};
