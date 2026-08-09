/** Studio dock CSS — denser desktop-tool look, SubBatch-inspired shell. */
export const STUDIO_CSS = `
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
