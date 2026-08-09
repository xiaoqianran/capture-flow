/** @typedef {{ url: string, task?: string }} CreateJobBody */
/** @typedef {{ id: string, status: string, document_id?: string, revision_id?: string, error_code?: string, error_message?: string, adapter?: string, collector?: string, trace?: string[] }} Job */

const DEFAULT_HUB = "http://127.0.0.1:8080";

/**
 * @returns {Promise<{ hubUrl: string, autoAi: boolean, recipeId: string }>}
 */
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

/**
 * @param {Partial<{ hubUrl: string, autoAi: boolean, recipeId: string }>} settings
 */
export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

/**
 * @param {string} hubUrl
 */
export async function healthCheck(hubUrl) {
  const res = await fetch(`${hubUrl}/health`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`health ${res.status}`);
  }
  return res.json();
}

/**
 * @param {string} hubUrl
 * @param {CreateJobBody} body
 * @returns {Promise<Job>}
 */
export async function createJob(hubUrl, body) {
  const res = await fetch(`${hubUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`POST /jobs invalid JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data.error_message || data.error_code || `POST /jobs ${res.status}`);
  }
  return data;
}

/**
 * @param {string} hubUrl
 * @param {string} jobId
 * @returns {Promise<Job>}
 */
export async function getJob(hubUrl, jobId) {
  const res = await fetch(`${hubUrl}/jobs/${encodeURIComponent(jobId)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_message || `GET /jobs ${res.status}`);
  }
  return data;
}

/**
 * @param {string} hubUrl
 * @param {string} jobId
 * @param {{ intervalMs?: number, timeoutMs?: number, onTick?: (job: Job) => void }} [opts]
 * @returns {Promise<Job>}
 */
export async function waitJob(hubUrl, jobId, opts = {}) {
  const intervalMs = opts.intervalMs ?? 600;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const started = Date.now();
  for (;;) {
    const job = await getJob(hubUrl, jobId);
    opts.onTick?.(job);
    if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timeout waiting for job ${jobId} (status=${job.status})`);
    }
    await sleep(intervalMs);
  }
}

/**
 * @param {string} hubUrl
 * @param {{ document_id: string, recipe_id?: string }} body
 */
export async function runAi(hubUrl, body) {
  const res = await fetch(`${hubUrl}/ai/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_message || `POST /ai/run ${res.status}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Human-readable job failure.
 * @param {Job} job
 */
export function formatJobFailure(job) {
  const parts = [];
  if (job.error_code) parts.push(job.error_code);
  if (job.error_message) parts.push(job.error_message);
  if (job.trace?.length) {
    parts.push(`trace: ${job.trace.slice(-4).join(" → ")}`);
  }
  return parts.join(" | ") || "capture failed";
}
