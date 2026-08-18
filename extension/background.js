import { captureSnapshot, getSettings } from "./lib/hub.js";
import { snapshotTab } from "./page-capture.js";

chrome.runtime.onInstalled.addListener(() => console.info("[capture-flow] extension installed"));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-page") return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      await notify("Capture Flow", "Only http(s) pages can be captured");
      return;
    }
    const settings = await getSettings();
    const snapshot = await snapshotTab(tab.id);
    const receipt = await captureSnapshot(settings.hubUrl, snapshot, settings);
    const suffix = receipt.ai_job ? ` · AI ${receipt.ai_job.status}` : "";
    await notify("Capture Flow", `Saved ${receipt.document_id}${suffix}`);
  } catch (e) {
    await notify("Capture Flow", String(e.message || e));
  }
});

async function notify(title, message) {
  console.info(`[capture-flow] ${title}: ${message}`);
  try {
    await chrome.action.setBadgeText({ text: "•" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
  } catch {
    // ignore
  }
}
