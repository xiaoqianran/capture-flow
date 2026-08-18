import {
  detectPageRoute,
  extractBrowserSnapshot,
  type PageRouteInfo,
} from "@capture-flow/core";
import type {
  AIQueueStats,
  CaptureFlowHubClient,
  CaptureReceipt,
  HubSettings,
} from "@capture-flow/hub-client";
import type { CaptureFlowRuntime } from "@capture-flow/runtime";

import { STUDIO_CSS } from "./styles";

export interface StudioController {
  mount(): void;
  destroy(): void;
  setOpen(open: boolean): void;
  refreshRoute(): void;
  captureCurrent(): Promise<void>;
}

export function createStudio(
  runtime: CaptureFlowRuntime,
  hub: CaptureFlowHubClient,
): StudioController {
  let root: HTMLDivElement | null = null;
  let settings: HubSettings | null = null;
  let route: PageRouteInfo = detectPageRoute(runtime.page.href());
  let busy = false;
  let unsubNav: (() => void) | null = null;
  let destroyed = false;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;

  const els = {
    fab: null as HTMLButtonElement | null,
    titleSub: null as HTMLElement | null,
    pageUrl: null as HTMLElement | null,
    siteBadge: null as HTMLElement | null,
    health: null as HTMLElement | null,
    autoAi: null as HTMLInputElement | null,
    autoCapture: null as HTMLInputElement | null,
    recipe: null as HTMLSelectElement | null,
    captureBtn: null as HTMLButtonElement | null,
    statusDot: null as HTMLElement | null,
    statusText: null as HTMLElement | null,
    statusLog: null as HTMLElement | null,
    hubUrlInput: null as HTMLInputElement | null,
    settingsHealth: null as HTMLElement | null,
  };

  function setStatus(kind: "idle" | "run" | "ok" | "err", title: string, log: string): void {
    if (!els.statusDot || !els.statusText || !els.statusLog) return;
    els.statusDot.className = `cf-dot${kind === "idle" ? "" : ` ${kind}`}`;
    els.statusText.textContent = title;
    els.statusLog.textContent = log;
  }

  function queueLine(stats?: AIQueueStats): string {
    if (!stats) return "";
    return `AI queue · running ${stats.running}/${stats.concurrency} · queued ${stats.queued} · retry ${stats.retry_wait}`;
  }

  async function loadSettings(): Promise<void> {
    settings = await hub.getSettings();
    applySettingsToDom();
  }

  function applySettingsToDom(): void {
    if (!settings || !root) return;
    root.classList.toggle("cf-open", settings.panelOpen);
    root.classList.toggle("cf-collapsed", !settings.panelOpen);
    root.classList.toggle("cf-side-right", settings.dockSide !== "left");
    root.classList.toggle("cf-side-left", settings.dockSide === "left");
    if (els.autoAi) els.autoAi.checked = settings.autoAi;
    if (els.autoCapture) els.autoCapture.checked = settings.autoCapture;
    if (els.recipe) els.recipe.value = settings.recipeId;
    if (els.hubUrlInput) els.hubUrlInput.value = settings.hubUrl;
    if (els.titleSub) els.titleSub.textContent = settings.hubUrl;
  }

  function refreshRoute(): void {
    route = detectPageRoute(runtime.page.href());
    if (els.pageUrl) {
      els.pageUrl.textContent = route.href || "(no url)";
      els.pageUrl.title = route.href;
    }
    if (els.siteBadge) els.siteBadge.textContent = route.site;
    if (els.captureBtn) els.captureBtn.disabled = busy || !route.canCapture;
  }

  async function pingHealth(): Promise<void> {
    try {
      const h = await hub.health();
      const queue = h.ai_queue ? ` · ${queueLine(h.ai_queue)}` : "";
      const text = `hub ok · ai ${h.ai_configured ? "on" : "off"}${queue}`;
      if (els.health) {
        els.health.textContent = text;
        els.health.style.color = "";
      }
      if (els.settingsHealth) {
        els.settingsHealth.textContent = text;
        els.settingsHealth.style.color = "var(--cf-ok)";
      }
    } catch (e) {
      const msg = `hub offline · ${e instanceof Error ? e.message : String(e)}`;
      if (els.health) {
        els.health.textContent = msg;
        els.health.style.color = "var(--cf-err)";
      }
      if (els.settingsHealth) {
        els.settingsHealth.textContent = msg;
        els.settingsHealth.style.color = "var(--cf-err)";
      }
    }
  }

  async function setOpen(open: boolean): Promise<void> {
    settings = await hub.saveSettings({ panelOpen: open });
    applySettingsToDom();
  }

  async function persistUiPrefs(): Promise<void> {
    settings = await hub.saveSettings({
      autoAi: Boolean(els.autoAi?.checked),
      autoCapture: Boolean(els.autoCapture?.checked),
      recipeId: els.recipe?.value || "summarize",
    });
  }

  async function saveHubUrl(): Promise<void> {
    const url = (els.hubUrlInput?.value || "").trim();
    settings = await hub.saveSettings({ hubUrl: url });
    applySettingsToDom();
    await pingHealth();
  }

  function formatReceipt(receipt: CaptureReceipt, stats?: AIQueueStats): string {
    const lines = [
      `document_id: ${receipt.document_id}`,
      `revision_id: ${receipt.revision_id}`,
      `deduped: ${receipt.deduped}`,
    ];
    if (receipt.ai_job) {
      lines.push(
        `AI job: ${receipt.ai_job.id}`,
        `AI status: ${receipt.ai_job.status}`,
        `model: ${receipt.ai_job.model || "default"}`,
      );
    }
    if (receipt.ai_error) lines.push(`AI enqueue error: ${receipt.ai_error}`);
    if (stats) lines.push(queueLine(stats));
    return lines.join("\n");
  }

  async function capture(origin: "manual" | "auto"): Promise<void> {
    if (busy || destroyed) return;
    refreshRoute();
    if (!route.canCapture) {
      if (origin === "manual") setStatus("err", "unsupported", route.reason || "cannot capture this page");
      return;
    }
    busy = true;
    if (els.captureBtn) els.captureBtn.disabled = true;
    setStatus("run", origin === "auto" ? "auto snapshot…" : "snapshot…", `${route.href}\nDOM → Local Hub`);
    try {
      await persistUiPrefs();
      const snapshot = extractBrowserSnapshot(document, route.href);
      const receipt = await hub.captureSnapshot(snapshot, {
        autoAi: settings?.autoAi,
        recipeId: settings?.recipeId,
      });
      const stats = await hub.queueStats().catch(() => undefined);
      const aiStatus = receipt.ai_job?.status;
      const label = receipt.ai_job
        ? `stored · AI ${aiStatus}`
        : receipt.deduped
          ? "deduped"
          : "stored";
      setStatus("ok", label, formatReceipt(receipt, stats));
      void pingHealth();
    } catch (e) {
      setStatus("err", "failed", e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
      if (els.captureBtn) els.captureBtn.disabled = !route.canCapture;
    }
  }

  function scheduleAutoCapture(): void {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
    if (!settings?.autoCapture || !route.canCapture || destroyed) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      void capture("auto");
    }, 1200);
  }

  async function captureCurrent(): Promise<void> {
    await capture("manual");
  }

  function buildDom(): HTMLDivElement {
    runtime.style.add(STUDIO_CSS);
    const el = document.createElement("div");
    el.id = "cf-root";
    el.innerHTML = `
      <button type="button" id="cf-fab" title="Open Capture Flow">Capture Flow</button>
      <section id="cf-panel">
        <header class="cf-head">
          <div>
            <h1>Capture Flow</h1>
            <p class="cf-sub" id="cf-title-sub">hub…</p>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="cf-iconbtn" id="cf-btn-settings" title="Settings">⚙</button>
            <button type="button" class="cf-iconbtn" id="cf-btn-close" title="Collapse">–</button>
          </div>
        </header>
        <div class="cf-body">
          <div class="cf-main">
            <div class="cf-card">
              <span class="cf-label">Current page</span>
              <div><span class="cf-badge" id="cf-site">generic</span></div>
              <div class="cf-url" id="cf-page-url">…</div>
            </div>
            <div class="cf-card">
              <div class="cf-row">
                <label><input type="checkbox" id="cf-auto-capture" /> 新页面自动采集</label>
                <label><input type="checkbox" id="cf-auto-ai" /> 自动加入 AI 队列</label>
              </div>
              <div class="cf-row" style="margin-top:10px">
                <select id="cf-recipe" aria-label="recipe">
                  <option value="summarize">summarize</option>
                  <option value="outline">outline</option>
                  <option value="qa-prep">qa-prep</option>
                </select>
                <button type="button" class="cf-primary" id="cf-capture">立即采集 Snapshot</button>
              </div>
            </div>
            <div class="cf-card">
              <div class="cf-status">
                <span class="cf-dot" id="cf-status-dot"></span>
                <span id="cf-status-text">idle</span>
              </div>
              <pre class="cf-log" id="cf-status-log">Browser DOM → /captures → durable AI queue</pre>
              <div class="cf-foot" id="cf-health">checking hub…</div>
            </div>
          </div>
          <div class="cf-settings">
            <div class="cf-card">
              <span class="cf-label">Hub Base URL</span>
              <input type="url" id="cf-hub-url" placeholder="http://127.0.0.1:8080" />
              <div class="cf-row" style="margin-top:10px">
                <button type="button" class="cf-ghost" id="cf-save-hub">保存并探测</button>
                <button type="button" class="cf-ghost" id="cf-back-main">返回</button>
              </div>
              <div class="cf-foot" id="cf-settings-health" style="margin-top:8px"></div>
            </div>
            <div class="cf-card">
              <span class="cf-label">Dock</span>
              <div class="cf-row">
                <button type="button" class="cf-ghost" id="cf-dock-left">Left</button>
                <button type="button" class="cf-ghost" id="cf-dock-right">Right</button>
              </div>
              <p class="cf-foot">快捷键：Alt+Shift+C 立即采集 · Alt+Shift+P 面板</p>
            </div>
          </div>
        </div>
      </section>
    `;
    return el;
  }

  function wire(): void {
    if (!root) return;
    els.fab = root.querySelector("#cf-fab");
    els.titleSub = root.querySelector("#cf-title-sub");
    els.pageUrl = root.querySelector("#cf-page-url");
    els.siteBadge = root.querySelector("#cf-site");
    els.health = root.querySelector("#cf-health");
    els.autoAi = root.querySelector("#cf-auto-ai");
    els.autoCapture = root.querySelector("#cf-auto-capture");
    els.recipe = root.querySelector("#cf-recipe");
    els.captureBtn = root.querySelector("#cf-capture");
    els.statusDot = root.querySelector("#cf-status-dot");
    els.statusText = root.querySelector("#cf-status-text");
    els.statusLog = root.querySelector("#cf-status-log");
    els.hubUrlInput = root.querySelector("#cf-hub-url");
    els.settingsHealth = root.querySelector("#cf-settings-health");

    els.fab?.addEventListener("click", () => void setOpen(true));
    root.querySelector("#cf-btn-close")?.addEventListener("click", () => void setOpen(false));
    root.querySelector("#cf-btn-settings")?.addEventListener("click", () => root?.classList.add("cf-settings-open"));
    root.querySelector("#cf-back-main")?.addEventListener("click", () => root?.classList.remove("cf-settings-open"));
    els.captureBtn?.addEventListener("click", () => void captureCurrent());
    els.autoAi?.addEventListener("change", () => void persistUiPrefs());
    els.autoCapture?.addEventListener("change", () => {
      void persistUiPrefs().then(scheduleAutoCapture);
    });
    els.recipe?.addEventListener("change", () => void persistUiPrefs());
    root.querySelector("#cf-save-hub")?.addEventListener("click", () => void saveHubUrl());
    root.querySelector("#cf-dock-left")?.addEventListener("click", async () => {
      settings = await hub.saveSettings({ dockSide: "left" });
      applySettingsToDom();
    });
    root.querySelector("#cf-dock-right")?.addEventListener("click", async () => {
      settings = await hub.saveSettings({ dockSide: "right" });
      applySettingsToDom();
    });
  }

  return {
    mount() {
      if (destroyed || root) return;
      root = buildDom();
      document.documentElement.appendChild(root);
      wire();
      void loadSettings().then(() => {
        refreshRoute();
        void pingHealth();
        scheduleAutoCapture();
      });
      unsubNav = runtime.page.onNavigate(() => {
        refreshRoute();
        scheduleAutoCapture();
      });
    },
    destroy() {
      destroyed = true;
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = null;
      unsubNav?.();
      unsubNav = null;
      root?.remove();
      root = null;
    },
    setOpen(open) {
      void setOpen(open);
    },
    refreshRoute,
    captureCurrent,
  };
}
