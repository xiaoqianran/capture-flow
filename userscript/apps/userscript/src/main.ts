/**
 * Capture Flow Userscript composition root.
 *
 * Design mirrors SubBatch / loop-bilibili-subbatch:
 *   Host Adapter → Runtime Ports → Hub Client → Studio UI
 *
 * Vite IIFE global: `CaptureFlow` with named exports.
 */
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_COMMANDS,
  detectPageRoute,
} from "@capture-flow/core";
import { createHubClient } from "@capture-flow/hub-client";
import { createUserscriptRuntime } from "@capture-flow/runtime";
import { createStudio } from "@capture-flow/ui";

import { createUserscriptHost } from "./userscript-host";

const host = createUserscriptHost();
const runtime = createUserscriptRuntime(host);
const hub = createHubClient(runtime);
const studio = createStudio(runtime, hub);

function boot(): void {
  studio.mount();

  runtime.shortcuts.register(
    [
      {
        chord: DEFAULT_SHORTCUTS[SHORTCUT_COMMANDS.CAPTURE_PAGE],
        handler: () => studio.captureCurrent(),
      },
      {
        chord: DEFAULT_SHORTCUTS[SHORTCUT_COMMANDS.TOGGLE_PANEL],
        handler: async () => {
          const s = await hub.getSettings();
          studio.setOpen(!s.panelOpen);
        },
      },
    ],
    { protectInput: true },
  );

  // Warm route detection once for public API consumers.
  detectPageRoute(runtime.page.href());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

/** Public monorepo API surface (SubBatchMonorepo-style). */
export const CaptureFlowMonorepo = {
  version: "0.1.0",
  runtime,
  host,
  hub,
  studio,
  detectPageRoute,
};

export { runtime, host, hub, studio };
