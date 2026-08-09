/** GM storage keys — keep stable across upgrades (SubBatch-style). */
export const STORAGE_KEYS = {
  hubUrl: "cf.hubUrl",
  autoAi: "cf.autoAi",
  recipeId: "cf.recipeId",
  panelOpen: "cf.panelOpen",
  dockSide: "cf.dockSide",
  shortcutCapture: "cf.shortcut.capture",
  shortcutToggle: "cf.shortcut.toggle",
} as const;

export type DockSide = "right" | "left";

export const DEFAULT_HUB_URL = "http://127.0.0.1:8080";
export const DEFAULT_RECIPE_ID = "summarize";

export const SHORTCUT_COMMANDS = {
  CAPTURE_PAGE: "capture-page",
  TOGGLE_PANEL: "toggle-panel",
} as const;

export const DEFAULT_SHORTCUTS = {
  [SHORTCUT_COMMANDS.CAPTURE_PAGE]: "Alt+Shift+C",
  [SHORTCUT_COMMANDS.TOGGLE_PANEL]: "Alt+Shift+P",
} as const;
