// ==UserScript==
// @name         Capture Flow
// @namespace    https://github.com/xiaoqianran/capture-flow
// @version      0.1.0
// @description  Local Hub 页面捕获工作台：当前页入队 OpenCLI 采集、轮询 Job、可选 AI Recipe（Studio Dock）
// @author       capture-flow
// @match        *://*/*
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

// Capture Flow monorepo userscript (0.1.0)
// Architecture: Host → Runtime Ports → Hub Client → Studio UI
// Build: pure monorepo product (no legacy body)
var CaptureFlow = (function(exports) {
  "use strict";
  function isEditableTarget(target) {
    if (!target || typeof target !== "object") return false;
    const el = target;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
  function shouldIgnoreShortcutEvent(event, options = {}) {
    if (options.enabled === false) return true;
    if (event.repeat) return true;
    if (event.isComposing) return true;
    if (event.getModifierState?.("AltGraph")) return true;
    if (isEditableTarget(event.target ?? null)) return true;
    return false;
  }
  function normalizeKey(event) {
    const key = String(event.key || "").toLowerCase();
    if (!key || key === "shift" || key === "control" || key === "alt" || key === "meta") {
      return null;
    }
    if (key.length === 1) return key.toUpperCase();
    const map = {
      escape: "Esc",
      " ": "Space",
      arrowup: "Up",
      arrowdown: "Down",
      arrowleft: "Left",
      arrowright: "Right"
    };
    return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
  }
  function shortcutChordFromEvent(event) {
    const key = normalizeKey(event);
    if (!key) return null;
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push(event.metaKey && !event.ctrlKey ? "Meta" : "Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    parts.push(key);
    return parts.join("+");
  }
  function detectPageRoute(href) {
    const url = String(href || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return {
        href: url,
        site: "unsupported",
        canCapture: false,
        reason: "仅支持 http(s) 页面"
      };
    }
    const lower = url.toLowerCase();
    if (lower.includes("zhihu.com")) {
      const isAnswer = /\/answer\/\d+/i.test(url) || /zhuanlan\.zhihu\.com\/p\/\d+/i.test(url);
      return {
        href: url,
        site: "zhihu",
        canCapture: isAnswer || true,
        reason: isAnswer ? void 0 : "知乎问题页可提交，但 Hub 可能要求回答/专栏链接"
      };
    }
    if (lower.includes("bilibili.com")) {
      return { href: url, site: "bilibili", canCapture: true };
    }
    return { href: url, site: "generic", canCapture: true };
  }
  function isTerminalJobStatus(status) {
    return status === "done" || status === "failed" || status === "cancelled";
  }
  function formatJobFailure(job) {
    const parts = [];
    if (job.error_code) parts.push(job.error_code);
    if (job.error_message) parts.push(job.error_message);
    if (job.trace?.length) parts.push(`trace: ${job.trace.slice(-4).join(" → ")}`);
    return parts.join(" | ") || "capture failed";
  }
  function formatJobLine(job) {
    const lines = [
      job.id ? `id: ${job.id}` : null,
      job.status ? `status: ${job.status}` : null,
      job.adapter ? `adapter: ${job.adapter}` : null,
      job.collector ? `collector: ${job.collector}` : null,
      job.document_id ? `document_id: ${job.document_id}` : null,
      job.revision_id ? `revision_id: ${job.revision_id}` : null,
      job.trace?.length ? `trace: ${job.trace.join(" → ")}` : null,
      job.error_code ? `error: ${job.error_code} ${job.error_message || ""}` : null
    ].filter(Boolean);
    return lines.join("\n");
  }
  const STORAGE_KEYS = {
    hubUrl: "cf.hubUrl",
    autoAi: "cf.autoAi",
    recipeId: "cf.recipeId",
    panelOpen: "cf.panelOpen",
    dockSide: "cf.dockSide",
    shortcutCapture: "cf.shortcut.capture",
    shortcutToggle: "cf.shortcut.toggle"
  };
  const DEFAULT_HUB_URL = "http://127.0.0.1:8080";
  const DEFAULT_RECIPE_ID = "summarize";
  const SHORTCUT_COMMANDS = {
    CAPTURE_PAGE: "capture-page",
    TOGGLE_PANEL: "toggle-panel"
  };
  const DEFAULT_SHORTCUTS = {
    [SHORTCUT_COMMANDS.CAPTURE_PAGE]: "Alt+Shift+C",
    [SHORTCUT_COMMANDS.TOGGLE_PANEL]: "Alt+Shift+P"
  };
  function normalizeHubUrl(url) {
    return String(url || DEFAULT_HUB_URL).replace(/\/$/, "");
  }
  function createHubClient(runtime2) {
    async function getSettings() {
      const [hubUrl, autoAi, recipeId, panelOpen, dockSide] = await Promise.all([
        runtime2.storage.get(STORAGE_KEYS.hubUrl, DEFAULT_HUB_URL),
        runtime2.storage.get(STORAGE_KEYS.autoAi, false),
        runtime2.storage.get(STORAGE_KEYS.recipeId, DEFAULT_RECIPE_ID),
        runtime2.storage.get(STORAGE_KEYS.panelOpen, true),
        runtime2.storage.get(STORAGE_KEYS.dockSide, "right")
      ]);
      return {
        hubUrl: normalizeHubUrl(String(hubUrl)),
        autoAi: Boolean(autoAi),
        recipeId: String(recipeId || DEFAULT_RECIPE_ID),
        panelOpen: Boolean(panelOpen),
        dockSide: dockSide === "left" ? "left" : "right"
      };
    }
    async function saveSettings(partial) {
      if (partial.hubUrl !== void 0) {
        await runtime2.storage.set(STORAGE_KEYS.hubUrl, normalizeHubUrl(partial.hubUrl));
      }
      if (partial.autoAi !== void 0) {
        await runtime2.storage.set(STORAGE_KEYS.autoAi, partial.autoAi);
      }
      if (partial.recipeId !== void 0) {
        await runtime2.storage.set(STORAGE_KEYS.recipeId, partial.recipeId);
      }
      if (partial.panelOpen !== void 0) {
        await runtime2.storage.set(STORAGE_KEYS.panelOpen, partial.panelOpen);
      }
      if (partial.dockSide !== void 0) {
        await runtime2.storage.set(STORAGE_KEYS.dockSide, partial.dockSide);
      }
      return getSettings();
    }
    async function hubJson(path, init = {}) {
      const settings = await getSettings();
      const url = `${settings.hubUrl}${path.startsWith("/") ? path : `/${path}`}`;
      const response = await runtime2.network.request(url, {
        fallback: "network-or-http",
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init.headers ?? {}
        }
      });
      let data = null;
      try {
        data = response.text ? JSON.parse(response.text) : null;
      } catch {
        throw new Error(`invalid JSON from ${path}: ${response.text.slice(0, 160)}`);
      }
      if (!response.ok) {
        const err = data;
        throw new Error(err?.error_message || err?.error_code || `HTTP ${response.status} ${path}`);
      }
      return data;
    }
    const client = {
      getSettings,
      saveSettings,
      health: () => hubJson("/health", { method: "GET", fallback: "network-or-http" }),
      available: async () => {
        try {
          const h = await hubJson("/health", { method: "GET" });
          return h.status === "ok";
        } catch {
          return false;
        }
      },
      createJob: (url, task = "full_text") => hubJson("/jobs", {
        method: "POST",
        body: JSON.stringify({ url, task }),
        fallback: "network-error"
      }),
      getJob: (id) => hubJson(`/jobs/${encodeURIComponent(id)}`, { method: "GET" }),
      waitJob: async (id, opts = {}) => {
        const intervalMs = opts.intervalMs ?? 600;
        const timeoutMs = opts.timeoutMs ?? 18e4;
        const started = Date.now();
        for (; ; ) {
          if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const job = await hubJson(`/jobs/${encodeURIComponent(id)}`, {
            method: "GET",
            signal: opts.signal
          });
          opts.onTick?.(job);
          if (isTerminalJobStatus(job.status)) return job;
          if (Date.now() - started > timeoutMs) {
            throw new Error(`timeout waiting for job ${id} (status=${job.status})`);
          }
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      },
      runAi: (documentId, recipeId = DEFAULT_RECIPE_ID) => hubJson("/ai/run", {
        method: "POST",
        body: JSON.stringify({ document_id: documentId, recipe_id: recipeId }),
        fallback: "network-error"
      }),
      capturePage: async (url, opts = {}) => {
        const settings = await getSettings();
        const jobQueued = await hubJson("/jobs", {
          method: "POST",
          body: JSON.stringify({ url, task: "full_text" }),
          fallback: "network-error"
        });
        const job = await client.waitJob(jobQueued.id, { onTick: opts.onTick });
        if (job.status !== "done") {
          throw new Error(formatJobFailure(job));
        }
        const autoAi = opts.autoAi ?? settings.autoAi;
        const recipeId = opts.recipeId ?? settings.recipeId;
        if (autoAi && job.document_id) {
          const ai = await client.runAi(job.document_id, recipeId);
          return { job, ai };
        }
        return { job };
      }
    };
    return client;
  }
  function createUserscriptRuntime(host2) {
    return {
      storage: {
        async get(key, fallback) {
          const value = await host2.storageGet(key, fallback);
          return value === void 0 ? fallback : value;
        },
        async set(key, value) {
          await host2.storageSet(key, value);
        },
        async remove(key) {
          await host2.storageRemove(key);
        }
      },
      network: {
        request(url, request) {
          return host2.request(url, request);
        },
        async json(url, request) {
          const response = await host2.request(url, request);
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
          return JSON.parse(response.text);
        }
      },
      clipboard: {
        async writeText(text) {
          await host2.writeClipboard(text);
        }
      },
      style: {
        add(css) {
          host2.addStyle(css);
        }
      },
      shortcuts: {
        register(bindings, options) {
          return host2.registerShortcuts(bindings, options);
        }
      },
      page: {
        href: () => host2.pageHref(),
        window: () => host2.pageWindow,
        onNavigate: (listener) => host2.onNavigate(listener)
      },
      hub: {
        available: () => host2.hubAvailable(),
        send: (path, init) => host2.hubSend(path, init),
        baseUrl: () => host2.hubBaseUrl()
      }
    };
  }
  const historyPatches = /* @__PURE__ */ new WeakMap();
  function subscribeHistoryPatch(history, callback) {
    let patch = historyPatches.get(history);
    if (!patch) {
      const originalPush = history.pushState;
      const originalReplace = history.replaceState;
      const callbacks = /* @__PURE__ */ new Set();
      const notify = () => {
        for (const subscriber of [...callbacks]) subscriber();
      };
      const wrappedPush = function wrappedPush2(...args) {
        const result = originalPush.apply(this, args);
        notify();
        return result;
      };
      const wrappedReplace = function wrappedReplace2(...args) {
        const result = originalReplace.apply(this, args);
        notify();
        return result;
      };
      patch = {
        originalPush,
        originalReplace,
        wrappedPush,
        wrappedReplace,
        callbacks
      };
      history.pushState = wrappedPush;
      history.replaceState = wrappedReplace;
      historyPatches.set(history, patch);
    }
    patch.callbacks.add(callback);
    return () => {
      const current = historyPatches.get(history);
      if (!current) return;
      current.callbacks.delete(callback);
      if (current.callbacks.size) return;
      if (history.pushState === current.wrappedPush) history.pushState = current.originalPush;
      if (history.replaceState === current.wrappedReplace) {
        history.replaceState = current.originalReplace;
      }
      historyPatches.delete(history);
    };
  }
  function installSpaNavigateAdapter(options, listener) {
    const historyWindow = options.historyWindow;
    const eventWindow = options.eventWindow ?? historyWindow;
    const documentRef = options.documentRef ?? null;
    const getHref = options.getHref ?? (() => String(historyWindow.location?.href || ""));
    const pollIntervalMs = options.pollIntervalMs ?? 2e3;
    const setIntervalFn = options.setIntervalFn ?? setInterval;
    const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    let lastHref = getHref();
    let disposed = false;
    const emitIfChanged = () => {
      if (disposed) return;
      const href = getHref();
      if (href === lastHref) return;
      lastHref = href;
      listener();
    };
    const onPop = () => emitIfChanged();
    const onHash = () => emitIfChanged();
    const onPageShow = () => emitIfChanged();
    const onVis = () => {
      if (documentRef?.visibilityState === "visible") emitIfChanged();
    };
    const unsubHistory = subscribeHistoryPatch(historyWindow.history, emitIfChanged);
    eventWindow.addEventListener("popstate", onPop);
    eventWindow.addEventListener("hashchange", onHash);
    eventWindow.addEventListener("pageshow", onPageShow);
    documentRef?.addEventListener("visibilitychange", onVis);
    let timer = null;
    if (pollIntervalMs > 0) {
      timer = setIntervalFn(emitIfChanged, pollIntervalMs);
    }
    return {
      check: emitIfChanged,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        unsubHistory();
        eventWindow.removeEventListener("popstate", onPop);
        eventWindow.removeEventListener("hashchange", onHash);
        eventWindow.removeEventListener("pageshow", onPageShow);
        documentRef?.removeEventListener("visibilitychange", onVis);
        if (timer) clearIntervalFn(timer);
      }
    };
  }
  function registerShortcutRuntime(bindings, options = {}) {
    const target = options.target;
    if (!target) throw new Error("registerShortcutRuntime requires a target EventTarget");
    const capture = options.capture !== false;
    const protectInput = options.protectInput !== false;
    const stopOnMatch = options.stopOnMatch !== false;
    const enabled = options.enabled !== false;
    const listener = (event) => {
      if (protectInput && shouldIgnoreShortcutEvent(event, { enabled })) return;
      if (!protectInput && options.enabled === false) return;
      const chord = shortcutChordFromEvent(event);
      if (!chord) return;
      const binding = bindings.find((candidate) => candidate.chord === chord);
      if (!binding) return;
      if (stopOnMatch) {
        const native = event;
        native.preventDefault?.();
        native.stopImmediatePropagation?.();
      }
      try {
        void Promise.resolve(binding.handler()).catch((error) => {
          options.onError?.(error);
        });
      } catch (error) {
        options.onError?.(error);
      }
    };
    target.addEventListener("keydown", listener, capture);
    return () => target.removeEventListener("keydown", listener, capture);
  }
  const STUDIO_CSS = `
#cf-root, #cf-root * { box-sizing: border-box; }
#cf-root {
  --cf-bg: #0f1419;
  --cf-panel: #1a222c;
  --cf-border: #2b3643;
  --cf-text: #e7eef7;
  --cf-muted: #8b9bb0;
  --cf-accent: #3b82f6;
  --cf-ok: #22c55e;
  --cf-warn: #f59e0b;
  --cf-err: #ef4444;
  position: fixed;
  top: 72px;
  z-index: 2147483646;
  width: 360px;
  max-height: calc(100vh - 96px);
  color: var(--cf-text);
  font: 12px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif;
  pointer-events: none;
}
#cf-root.cf-side-right { right: 16px; }
#cf-root.cf-side-left { left: 16px; }
#cf-root.cf-collapsed { width: auto; }
#cf-fab {
  pointer-events: auto;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: var(--cf-accent);
  color: #fff;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
#cf-panel {
  pointer-events: auto;
  display: none;
  margin-top: 10px;
  background: var(--cf-panel);
  border: 1px solid var(--cf-border);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0,0,0,.4);
  overflow: hidden;
}
#cf-root.cf-open #cf-panel { display: block; }
#cf-root.cf-open #cf-fab { display: none; }
.cf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--cf-border);
  background: linear-gradient(180deg, #1e2835, #1a222c);
}
.cf-head h1 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .02em;
}
.cf-head .cf-sub {
  margin: 2px 0 0;
  color: var(--cf-muted);
  font-size: 11px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf-iconbtn {
  border: 1px solid var(--cf-border);
  background: transparent;
  color: var(--cf-text);
  border-radius: 8px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.cf-body { padding: 12px; max-height: min(70vh, 560px); overflow: auto; }
.cf-card {
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  background: #121820;
}
.cf-label {
  display: block;
  color: var(--cf-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .05em;
  margin-bottom: 4px;
}
.cf-url {
  word-break: break-all;
  font-size: 12px;
}
.cf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.cf-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
select, input[type="text"], input[type="url"] {
  width: 100%;
  border: 1px solid var(--cf-border);
  background: #0f1419;
  color: var(--cf-text);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 12px;
}
.cf-primary, .cf-ghost {
  border-radius: 10px;
  padding: 9px 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
}
.cf-primary {
  width: 100%;
  border: 0;
  background: var(--cf-accent);
  color: #fff;
}
.cf-primary:disabled { opacity: .55; cursor: not-allowed; }
.cf-ghost {
  border: 1px solid var(--cf-border);
  background: transparent;
  color: var(--cf-text);
}
.cf-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-weight: 650;
}
.cf-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--cf-muted);
}
.cf-dot.ok { background: var(--cf-ok); }
.cf-dot.err { background: var(--cf-err); }
.cf-dot.run { background: var(--cf-warn); box-shadow: 0 0 0 3px rgba(245,158,11,.2); }
.cf-log {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  color: var(--cf-muted);
  max-height: 180px;
  overflow: auto;
  margin: 0;
}
.cf-badge {
  display: inline-block;
  border: 1px solid var(--cf-border);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 10px;
  color: var(--cf-muted);
  margin-right: 4px;
}
.cf-foot {
  color: var(--cf-muted);
  font-size: 11px;
  margin-top: 4px;
}
.cf-settings { display: none; }
#cf-root.cf-settings-open .cf-settings { display: block; }
#cf-root.cf-settings-open .cf-main { display: none; }
`;
  function createStudio(runtime2, hub2) {
    let root = null;
    let settings = null;
    let route = detectPageRoute(runtime2.page.href());
    let busy = false;
    let unsubNav = null;
    let destroyed = false;
    const els = {
      fab: null,
      panel: null,
      titleSub: null,
      pageUrl: null,
      siteBadge: null,
      health: null,
      autoAi: null,
      recipe: null,
      captureBtn: null,
      statusDot: null,
      statusText: null,
      statusLog: null,
      hubUrlInput: null,
      settingsHealth: null
    };
    function setStatus(kind, title, log) {
      if (!els.statusDot || !els.statusText || !els.statusLog) return;
      els.statusDot.className = `cf-dot${kind === "idle" ? "" : ` ${kind}`}`;
      els.statusText.textContent = title;
      els.statusLog.textContent = log;
    }
    async function loadSettings() {
      settings = await hub2.getSettings();
      applySettingsToDom();
    }
    function applySettingsToDom() {
      if (!settings || !root) return;
      root.classList.toggle("cf-open", settings.panelOpen);
      root.classList.toggle("cf-collapsed", !settings.panelOpen);
      root.classList.toggle("cf-side-right", settings.dockSide !== "left");
      root.classList.toggle("cf-side-left", settings.dockSide === "left");
      if (els.autoAi) els.autoAi.checked = settings.autoAi;
      if (els.recipe) els.recipe.value = settings.recipeId;
      if (els.hubUrlInput) els.hubUrlInput.value = settings.hubUrl;
      if (els.titleSub) els.titleSub.textContent = settings.hubUrl;
    }
    function refreshRoute() {
      route = detectPageRoute(runtime2.page.href());
      if (els.pageUrl) {
        els.pageUrl.textContent = route.href || "(no url)";
        els.pageUrl.title = route.href;
      }
      if (els.siteBadge) {
        els.siteBadge.textContent = route.site;
      }
      if (els.captureBtn) {
        els.captureBtn.disabled = busy || !route.canCapture;
      }
    }
    async function pingHealth() {
      try {
        const h = await hub2.health();
        const text = `hub ok · ai ${h.ai_configured ? "on" : "off"}`;
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
    async function setOpen(open) {
      settings = await hub2.saveSettings({ panelOpen: open });
      applySettingsToDom();
    }
    async function persistUiPrefs() {
      settings = await hub2.saveSettings({
        autoAi: Boolean(els.autoAi?.checked),
        recipeId: els.recipe?.value || "summarize"
      });
    }
    async function saveHubUrl() {
      const url = (els.hubUrlInput?.value || "").trim();
      settings = await hub2.saveSettings({ hubUrl: url });
      applySettingsToDom();
      await pingHealth();
    }
    async function captureCurrent() {
      if (busy) return;
      refreshRoute();
      if (!route.canCapture) {
        setStatus("err", "unsupported", route.reason || "cannot capture this page");
        return;
      }
      busy = true;
      if (els.captureBtn) els.captureBtn.disabled = true;
      setStatus("run", "queued…", `POST /jobs
${route.href}`);
      try {
        await persistUiPrefs();
        const result = await hub2.capturePage(route.href, {
          onTick: (job) => {
            setStatus("run", `${job.status}`, formatJobLine(job));
          }
        });
        let log = formatJobLine(result.job);
        if (result.ai) {
          log += `

AI ${result.ai.recipe_id} · ${result.ai.id}
${String(result.ai.content_md || "").slice(0, 500)}`;
        }
        setStatus("ok", result.ai ? "done + AI" : "done", log);
      } catch (e) {
        setStatus("err", "failed", e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
        if (els.captureBtn) els.captureBtn.disabled = !route.canCapture;
      }
    }
    function buildDom() {
      runtime2.style.add(STUDIO_CSS);
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
                <label><input type="checkbox" id="cf-auto-ai" /> Capture 后跑 AI</label>
                <select id="cf-recipe" aria-label="recipe">
                  <option value="summarize">summarize</option>
                  <option value="outline">outline</option>
                  <option value="qa-prep">qa-prep</option>
                </select>
              </div>
              <div style="margin-top:10px">
                <button type="button" class="cf-primary" id="cf-capture">捕获到 Local Hub</button>
              </div>
            </div>
            <div class="cf-card">
              <div class="cf-status">
                <span class="cf-dot" id="cf-status-dot"></span>
                <span id="cf-status-text">idle</span>
              </div>
              <pre class="cf-log" id="cf-status-log">Ready. Hub 需已启动：go run ./cmd/hub</pre>
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
              <p class="cf-foot">快捷键：Alt+Shift+C 捕获 · Alt+Shift+P 面板</p>
            </div>
          </div>
        </div>
      </section>
    `;
      return el;
    }
    function wire() {
      if (!root) return;
      els.fab = root.querySelector("#cf-fab");
      els.panel = root.querySelector("#cf-panel");
      els.titleSub = root.querySelector("#cf-title-sub");
      els.pageUrl = root.querySelector("#cf-page-url");
      els.siteBadge = root.querySelector("#cf-site");
      els.health = root.querySelector("#cf-health");
      els.autoAi = root.querySelector("#cf-auto-ai");
      els.recipe = root.querySelector("#cf-recipe");
      els.captureBtn = root.querySelector("#cf-capture");
      els.statusDot = root.querySelector("#cf-status-dot");
      els.statusText = root.querySelector("#cf-status-text");
      els.statusLog = root.querySelector("#cf-status-log");
      els.hubUrlInput = root.querySelector("#cf-hub-url");
      els.settingsHealth = root.querySelector("#cf-settings-health");
      els.fab?.addEventListener("click", () => void setOpen(true));
      root.querySelector("#cf-btn-close")?.addEventListener("click", () => void setOpen(false));
      root.querySelector("#cf-btn-settings")?.addEventListener("click", () => {
        root?.classList.add("cf-settings-open");
      });
      root.querySelector("#cf-back-main")?.addEventListener("click", () => {
        root?.classList.remove("cf-settings-open");
      });
      els.captureBtn?.addEventListener("click", () => void captureCurrent());
      els.autoAi?.addEventListener("change", () => void persistUiPrefs());
      els.recipe?.addEventListener("change", () => void persistUiPrefs());
      root.querySelector("#cf-save-hub")?.addEventListener("click", () => void saveHubUrl());
      root.querySelector("#cf-dock-left")?.addEventListener("click", async () => {
        settings = await hub2.saveSettings({ dockSide: "left" });
        applySettingsToDom();
      });
      root.querySelector("#cf-dock-right")?.addEventListener("click", async () => {
        settings = await hub2.saveSettings({ dockSide: "right" });
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
        });
        unsubNav = runtime2.page.onNavigate(() => {
          refreshRoute();
        });
      },
      destroy() {
        destroyed = true;
        unsubNav?.();
        unsubNav = null;
        root?.remove();
        root = null;
      },
      setOpen(open) {
        void setOpen(open);
      },
      refreshRoute,
      captureCurrent
    };
  }
  function parseResponseHeaders(raw) {
    const headers = {};
    for (const line of String(raw || "").split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
    return headers;
  }
  class FetchNetworkError extends Error {
    cause;
    constructor(cause) {
      super(cause instanceof Error ? cause.message : String(cause));
      this.name = "FetchNetworkError";
      this.cause = cause;
    }
  }
  async function fetchRequest(pageWindow, url, request = {}) {
    let response;
    try {
      const fetchFn = pageWindow.fetch || fetch;
      response = await fetchFn.call(pageWindow, url, {
        ...request.method ? { method: request.method } : {},
        ...request.headers ? { headers: request.headers } : {},
        ...request.body !== void 0 ? { body: request.body } : {},
        ...request.signal ? { signal: request.signal } : {},
        ...request.credentials ? { credentials: request.credentials } : {},
        ...request.cache ? { cache: request.cache } : {}
      });
    } catch (error) {
      throw new FetchNetworkError(error);
    }
    const headers = Object.fromEntries(response.headers.entries());
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      headers
    };
  }
  function privilegedRequest(url, request = {}) {
    if (typeof GM_xmlhttpRequest !== "function") {
      return Promise.reject(new Error("GM_xmlhttpRequest is unavailable"));
    }
    if (request.signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const handle = {};
      const onAbort = () => {
        try {
          handle.current?.abort?.();
        } catch {
        }
        fail(new DOMException("Aborted", "AbortError"));
      };
      const cleanup = () => request.signal?.removeEventListener("abort", onAbort);
      const finish = (response) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(response);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      request.signal?.addEventListener("abort", onAbort, { once: true });
      handle.current = GM_xmlhttpRequest({
        url,
        ...request.method ? { method: request.method } : {},
        ...request.headers ? { headers: request.headers } : {},
        ...request.body !== void 0 ? { data: request.body } : {},
        onload: (response) => {
          finish({
            status: response.status,
            ok: response.status >= 200 && response.status < 300,
            text: String(response.responseText || ""),
            headers: parseResponseHeaders(response.responseHeaders)
          });
        },
        onerror: (error) => fail(error),
        onabort: () => fail(new DOMException("Aborted", "AbortError"))
      });
    });
  }
  function mayRetryHttpFailure(request) {
    if (request.fallback !== "network-or-http") return false;
    const method = String(request.method || "GET").toUpperCase();
    return method === "GET" || method === "HEAD" || method === "OPTIONS";
  }
  function resolvePageWindow() {
    return typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
  }
  function pageHrefOf(pageWindow) {
    try {
      return String(pageWindow.location?.href || location.href);
    } catch {
      return location.href;
    }
  }
  function onNavigate(listener) {
    const pageWindow = resolvePageWindow();
    const handle = installSpaNavigateAdapter(
      {
        historyWindow: pageWindow,
        eventWindow: pageWindow,
        documentRef: document,
        getHref: () => pageHrefOf(pageWindow),
        pollIntervalMs: 2e3
      },
      listener
    );
    return () => handle.dispose();
  }
  function readHubBaseFromStorage() {
    try {
      if (typeof GM_getValue === "function") {
        const v = GM_getValue(STORAGE_KEYS.hubUrl, DEFAULT_HUB_URL);
        return String(v || DEFAULT_HUB_URL).replace(/\/$/, "");
      }
    } catch {
    }
    return DEFAULT_HUB_URL;
  }
  function createUserscriptHost() {
    const pageWindow = resolvePageWindow();
    return {
      storageGet: (key, fallback) => typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback,
      storageSet: (key, value) => {
        if (typeof GM_setValue === "function") GM_setValue(key, value);
      },
      storageRemove: (key) => {
        if (typeof GM_deleteValue === "function") GM_deleteValue(key);
      },
      request: async (url, request) => {
        try {
          const response = await fetchRequest(pageWindow, url, request);
          if (!response.ok && mayRetryHttpFailure(request ?? {})) {
            return privilegedRequest(url, request);
          }
          return response;
        } catch (error) {
          if (request?.signal?.aborted) throw error;
          if (error instanceof FetchNetworkError && request?.fallback !== "never") {
            return privilegedRequest(url, request);
          }
          throw error;
        }
      },
      writeClipboard: async (text) => {
        if (typeof GM_setClipboard === "function") GM_setClipboard(text);
        else await navigator.clipboard.writeText(text);
      },
      addStyle: (css) => {
        if (typeof GM_addStyle === "function") {
          GM_addStyle(css);
          return;
        }
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      },
      pageWindow,
      pageHref: () => pageHrefOf(pageWindow),
      registerShortcuts: (bindings, options = {}) => registerShortcutRuntime(bindings, {
        ...options,
        target: document,
        capture: true,
        stopOnMatch: true
      }),
      onNavigate,
      hubBaseUrl: () => readHubBaseFromStorage(),
      hubAvailable: async () => {
        try {
          const base = readHubBaseFromStorage();
          const res = await privilegedRequest(`${base}/health`, {
            method: "GET",
            fallback: "never"
          });
          if (!res.ok) return false;
          const data = JSON.parse(res.text);
          return data.status === "ok";
        } catch {
          return false;
        }
      },
      hubSend: async (path, init = {}) => {
        const base = readHubBaseFromStorage();
        const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
        const res = await privilegedRequest(url, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...init.headers ?? {}
          }
        });
        if (!res.ok) throw new Error(`Hub HTTP ${res.status}: ${path}`);
        return JSON.parse(res.text);
      }
    };
  }
  const host = createUserscriptHost();
  const runtime = createUserscriptRuntime(host);
  const hub = createHubClient(runtime);
  const studio = createStudio(runtime, hub);
  function boot() {
    studio.mount();
    runtime.shortcuts.register(
      [
        {
          chord: DEFAULT_SHORTCUTS[SHORTCUT_COMMANDS.CAPTURE_PAGE],
          handler: () => studio.captureCurrent()
        },
        {
          chord: DEFAULT_SHORTCUTS[SHORTCUT_COMMANDS.TOGGLE_PANEL],
          handler: async () => {
            const s = await hub.getSettings();
            studio.setOpen(!s.panelOpen);
          }
        }
      ],
      { protectInput: true }
    );
    detectPageRoute(runtime.page.href());
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  const CaptureFlowMonorepo = {
    version: "0.1.0",
    runtime,
    host,
    hub,
    studio,
    detectPageRoute
  };
  exports.CaptureFlowMonorepo = CaptureFlowMonorepo;
  exports.host = host;
  exports.hub = hub;
  exports.runtime = runtime;
  exports.studio = studio;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
