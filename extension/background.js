import { createJob, getSettings, waitJob, runAi, formatJobFailure } from "./lib/hub.js";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[capture-flow] extension installed");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-page") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      await notify("Capture Flow", "No active tab URL");
      return;
    }
    if (!/^https?:/i.test(tab.url)) {
      await notify("Capture Flow", "Only http(s) pages can be captured");
      return;
    }
    const settings = await getSettings();
    const job = await createJob(settings.hubUrl, { url: tab.url, task: "full_text" });
    await notify("Capture Flow", `Queued ${job.id}`);
    const done = await waitJob(settings.hubUrl, job.id);
    if (done.status !== "done") {
      await notify("Capture Flow", formatJobFailure(done));
      return;
    }
    let msg = `Saved ${done.document_id || "document"}`;
    if (settings.autoAi && done.document_id) {
      try {
        const ai = await runAi(settings.hubUrl, {
          document_id: done.document_id,
          recipe_id: settings.recipeId,
        });
        msg += ` · AI ${ai.recipe_id || settings.recipeId}`;
      } catch (e) {
        msg += ` · AI failed: ${e.message || e}`;
      }
    }
    await notify("Capture Flow", msg);
  } catch (e) {
    await notify("Capture Flow", String(e.message || e));
  }
});

/**
 * @param {string} title
 * @param {string} message
 */
async function notify(title, message) {
  // Prefer console + optional badge; notifications permission not required for MVP.
  console.info(`[capture-flow] ${title}: ${message}`);
  try {
    await chrome.action.setBadgeText({ text: "•" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
  } catch {
    // ignore
  }
}
