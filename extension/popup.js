import { captureSnapshot, getSettings, healthCheck, queueStats, saveSettings } from "./lib/hub.js";
import { snapshotTab } from "./page-capture.js";

const els = {
  hubLabel: document.getElementById("hubLabel"),
  pageUrl: document.getElementById("pageUrl"),
  pageTitle: document.getElementById("pageTitle"),
  autoAi: document.getElementById("autoAi"),
  recipeId: document.getElementById("recipeId"),
  captureBtn: document.getElementById("captureBtn"),
  openOptions: document.getElementById("openOptions"),
  statusCard: document.getElementById("statusCard"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  statusLog: document.getElementById("statusLog"),
  healthText: document.getElementById("healthText"),
};

let settings = { hubUrl: "http://127.0.0.1:8080", autoAi: false, recipeId: "summarize" };
let activeTab = null;

init().catch((e) => setStatus("err", "init failed", String(e.message || e)));

async function init() {
  settings = await getSettings();
  els.hubLabel.textContent = `hub: ${settings.hubUrl}`;
  els.autoAi.checked = settings.autoAi;
  els.recipeId.value = settings.recipeId;
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.url) {
    els.pageUrl.textContent = activeTab.url;
    els.pageUrl.title = activeTab.url;
    els.pageTitle.textContent = activeTab.title || "";
  } else {
    els.pageUrl.textContent = "（无可用标签页）";
    els.captureBtn.disabled = true;
  }
  try {
    const health = await healthCheck(settings.hubUrl);
    const q = health.ai_queue;
    els.healthText.textContent = q
      ? `hub ok · ai ${health.ai_configured ? "on" : "off"} · ${q.running}/${q.concurrency} running · ${q.queued} queued`
      : `hub ok · ai ${health.ai_configured ? "on" : "off"}`;
  } catch (e) {
    els.healthText.textContent = `hub unreachable · ${e.message || e}`;
    els.healthText.style.color = "var(--err)";
  }
  els.captureBtn.addEventListener("click", onCapture);
  els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.autoAi.addEventListener("change", persistUiSettings);
  els.recipeId.addEventListener("change", persistUiSettings);
}

async function persistUiSettings() {
  settings.autoAi = els.autoAi.checked;
  settings.recipeId = els.recipeId.value;
  await saveSettings({ autoAi: settings.autoAi, recipeId: settings.recipeId });
}

async function onCapture() {
  if (!activeTab?.id || !/^https?:/i.test(activeTab.url || "")) {
    setStatus("err", "unsupported url", "Only http(s) pages can be captured.");
    return;
  }
  els.captureBtn.disabled = true;
  setStatus("running", "extracting DOM…", activeTab.url);
  try {
    await persistUiSettings();
    const snapshot = await snapshotTab(activeTab.id);
    setStatus("running", "sending snapshot…", `POST ${settings.hubUrl}/captures\n${snapshot.url}`);
    const receipt = await captureSnapshot(settings.hubUrl, snapshot, settings);
    const stats = await queueStats(settings.hubUrl).catch(() => null);
    const lines = [
      `document_id: ${receipt.document_id}`,
      `revision_id: ${receipt.revision_id}`,
      `deduped: ${receipt.deduped}`,
      receipt.ai_job ? `AI: ${receipt.ai_job.status} · ${receipt.ai_job.id}` : null,
      receipt.ai_error ? `AI enqueue error: ${receipt.ai_error}` : null,
      stats ? `queue: running ${stats.running}/${stats.concurrency} · queued ${stats.queued}` : null,
    ].filter(Boolean);
    setStatus("ok", receipt.ai_job ? `stored · AI ${receipt.ai_job.status}` : "stored", lines.join("\n"));
  } catch (e) {
    setStatus("err", "error", String(e.message || e));
  } finally {
    els.captureBtn.disabled = false;
  }
}

function setStatus(kind, title, log) {
  els.statusCard.hidden = false;
  els.statusText.textContent = title;
  els.statusLog.textContent = log;
  els.statusDot.className = "dot " + (kind === "warn" ? "running" : kind);
}
