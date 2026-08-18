/** @typedef {{ url: string, task?: string }} CreateJobBody */
/** @typedef {{ id: string, status: string, document_id?: string, revision_id?: string, error_code?: string, error_message?: string, adapter?: string, collector?: string, trace?: string[] }} Job */

const DEFAULT_HUB = "http://127.0.0.1:8080";

export async function getSettings() {
  const data = await chrome.storage.sync.get({
    hubUrl: DEFAULT_HUB,
    autoAi: false,
    recipeId: "summarize",
  });
  return {
    hubUrl: String(data.hubUrl || DEFAULT_HUB).replace(/\/$/, ""),
    autoAi: Boolean(data.autoAi),
    recipeId: String(data.recipeId || "summarize"),
  };
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

async function hubJson(hubUrl, path, init = {}) {
  const res = await fetch(`${hubUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} invalid JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data?.error_message || data?.error_code || `${path} ${res.status}`);
  return data;
}

export async function healthCheck(hubUrl) {
  return hubJson(hubUrl, "/health", { method: "GET" });
}

export async function captureSnapshot(hubUrl, snapshot, options = {}) {
  return hubJson(hubUrl, "/captures", {
    method: "POST",
    body: JSON.stringify({
      ...snapshot,
      auto_ai: Boolean(options.autoAi),
      recipe_id: options.recipeId || "summarize",
    }),
  });
}

export async function queueStats(hubUrl) {
  return hubJson(hubUrl, "/ai/queue", { method: "GET" });
}

// URL-only fallback API retained for pages where scripting is unavailable.
export async function createJob(hubUrl, body) {
  return hubJson(hubUrl, "/jobs", { method: "POST", body: JSON.stringify(body) });
}

export async function getJob(hubUrl, jobId) {
  return hubJson(hubUrl, `/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
}

export async function waitJob(hubUrl, jobId, opts = {}) {
  const intervalMs = opts.intervalMs ?? 600;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const started = Date.now();
  for (;;) {
    const job = await getJob(hubUrl, jobId);
    opts.onTick?.(job);
    if (["done", "failed", "cancelled"].includes(job.status)) return job;
    if (Date.now() - started > timeoutMs) throw new Error(`timeout waiting for job ${jobId}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function formatJobFailure(job) {
  const parts = [];
  if (job.error_code) parts.push(job.error_code);
  if (job.error_message) parts.push(job.error_message);
  if (job.trace?.length) parts.push(`trace: ${job.trace.slice(-4).join(" → ")}`);
  return parts.join(" | ") || "capture failed";
}
