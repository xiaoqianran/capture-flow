import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./readability.css";

function syncBrowserTheme(): void {
  const theme = document.documentElement.dataset.theme === "latte" ? "latte" : "mocha";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "latte" ? "#eff1f5" : "#1e1e2e");
}

syncBrowserTheme();
new MutationObserver(syncBrowserTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
