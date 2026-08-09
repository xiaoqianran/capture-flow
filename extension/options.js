import { getSettings, healthCheck, saveSettings } from "./lib/hub.js";

const hubUrl = document.getElementById("hubUrl");
const autoAi = document.getElementById("autoAi");
const recipeId = document.getElementById("recipeId");
const saveBtn = document.getElementById("saveBtn");
const saveMsg = document.getElementById("saveMsg");

init();

async function init() {
  const s = await getSettings();
  hubUrl.value = s.hubUrl;
  autoAi.checked = s.autoAi;
  recipeId.value = s.recipeId;
  saveBtn.addEventListener("click", onSave);
}

async function onSave() {
  const url = hubUrl.value.trim().replace(/\/$/, "") || "http://127.0.0.1:8080";
  try {
    new URL(url);
  } catch {
    saveMsg.textContent = "Hub URL 无效";
    saveMsg.style.color = "var(--err)";
    return;
  }

  await saveSettings({
    hubUrl: url,
    autoAi: autoAi.checked,
    recipeId: recipeId.value,
  });

  try {
    const h = await healthCheck(url);
    saveMsg.textContent = `已保存 · hub ok · ai_configured=${Boolean(h.ai_configured)}`;
    saveMsg.style.color = "var(--ok)";
  } catch (e) {
    saveMsg.textContent = `已保存 · 但当前连不上 hub（${e.message || e}）`;
    saveMsg.style.color = "var(--warn)";
  }
}
