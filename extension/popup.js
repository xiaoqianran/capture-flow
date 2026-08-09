import {
  createJob,
  formatJobFailure,
  getSettings,
  healthCheck,
  runAi,
  saveSettings,
  waitJob,
} from "./lib/hub.js";

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

/** @type {{ hubUrl: string, autoAi: boolean, recipeId: string }} */
let settings = { hubUrl: "http://127.0.0.1:8080", autoAi: false, recipeId: "summarize" };
/** @type {chrome.tabs.Tab | null} */
let activeTab = null;

init().catch((e) => {
  setStatus("err", "init failed", String(e.message || e));
});

async function init() {
  settings = await getSettings();
  els.hubLabel.textContent = `hub: ${settings.hubUrl}`;
  els.autoAi.checked = settings.autoAi;
  els.recipeId.value = settings.recipeId;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (tab?.url) {
    els.pageUrl.textContent = tab.url;
    els.pageUrl.title = tab.url;
    els.pageTitle.textContent = tab.title || "";
  } else {
    els.pageUrl.textContent = "（无可用标签页）";
    els.captureBtn.disabled = true;
  }

  try {
    const health = await healthCheck(settings.hubUrl);
    const ai = health.ai_configured ? "ai:on" : "ai:off";
    els.healthText.textContent = `hub ok · ${ai}`;
    els.healthText.style.color = "";
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
  const url = activeTab?.url || "";
  if (!/^https?:/i.test(url)) {
    setStatus("err", "unsupported url", "Only http(s) pages can be captured via OpenCLI adapters.");
    return;
  }

  els.captureBtn.disabled = true;
  setStatus("running", "queued…", `POST ${settings.hubUrl}/jobs\n${url}`);

  try {
    await persistUiSettings();
    const job = await createJob(settings.hubUrl, { url, task: "full_text" });
    setStatus("running", `job ${shortId(job.id)}`, formatJobLine(job));

    const done = await waitJob(settings.hubUrl, job.id, {
      onTick: (j) => setStatus("running", `job ${shortId(j.id)} · ${j.status}`, formatJobLine(j)),
    });

    if (done.status !== "done") {
      setStatus("err", `failed · ${done.status}`, formatJobFailure(done));
      return;
    }

    let log = formatJobLine(done);
    if (settings.autoAi && done.document_id) {
      setStatus("running", "running AI…", log + "\n→ POST /ai/run");
      try {
        const ai = await runAi(settings.hubUrl, {
          document_id: done.document_id,
          recipe_id: settings.recipeId,
        });
        log += `\nAI ok · ${ai.id}\nrecipe=${ai.recipe_id} model=${ai.model}`;
        if (ai.content_md) {
          log += `\n---\n${String(ai.content_md).slice(0, 500)}`;
        }
      } catch (e) {
        log += `\nAI failed: ${e.message || e}`;
        setStatus("warn", "captured · AI failed", log);
        return;
      }
    }

    setStatus("ok", "done", log);
  } catch (e) {
    setStatus("err", "error", String(e.message || e));
  } finally {
    els.captureBtn.disabled = false;
  }
}

/**
 * @param {"running"|"ok"|"err"|"warn"} kind
 * @param {string} title
 * @param {string} log
 */
function setStatus(kind, title, log) {
  els.statusCard.hidden = false;
  els.statusText.textContent = title;
  els.statusLog.textContent = log;
  els.statusDot.className = "dot " + (kind === "warn" ? "running" : kind);
}

/** @param {import('./lib/hub.js').Job} job */
function formatJobLine(job) {
  const lines = [
    `id: ${job.id}`,
    `status: ${job.status}`,
    job.adapter ? `adapter: ${job.adapter}` : null,
    job.collector ? `collector: ${job.collector}` : null,
    job.document_id ? `document_id: ${job.document_id}` : null,
    job.revision_id ? `revision_id: ${job.revision_id}` : null,
    job.trace?.length ? `trace: ${job.trace.join(" → ")}` : null,
    job.error_code ? `error: ${job.error_code} ${job.error_message || ""}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function shortId(id) {
  if (!id) return "";
  return id.length > 14 ? id.slice(0, 14) + "…" : id;
}
