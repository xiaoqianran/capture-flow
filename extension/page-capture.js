/**
 * Runs inside the active page via chrome.scripting.executeScript.
 * Keep this function self-contained: Chrome serializes it into the page world.
 */
export function extractPageSnapshot() {
  const drop = "script,style,noscript,svg,canvas,iframe,nav,footer,aside,form,button,input,textarea,select,#cf-root,[aria-hidden='true']";
  const selectors = [
    "article",
    "main",
    "[role='main']",
    ".Post-RichTextContainer",
    ".RichContent-inner",
    ".article-content",
    ".post-content",
    ".entry-content",
    "body",
  ];
  let root = document.body || document.documentElement;
  let bestLen = -1;
  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      const len = (el.textContent || "").trim().length;
      if (len > bestLen) {
        root = el;
        bestLen = len;
      }
    }
    if (bestLen > 1200 && selector !== "body") break;
  }

  const clone = root.cloneNode(true);
  clone.querySelectorAll(drop).forEach((node) => node.remove());
  clone.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,br,section,div").forEach((node) => {
    if (node.tagName === "BR") node.replaceWith("\n");
    else node.append("\n");
  });
  const clean = (value) =>
    String(value || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  const text = clean(clone.textContent || document.body?.innerText || "");
  if (!text) throw new Error("page content is empty");

  const meta = (selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.content?.trim();
      if (value) return value;
    }
    return "";
  };
  const title =
    meta(["meta[property='og:title']", "meta[name='twitter:title']"]) ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title?.trim() ||
    location.href;
  const author =
    meta(["meta[name='author']", "meta[property='article:author']", "meta[name='byl']"]) ||
    document.querySelector("[rel='author']")?.textContent?.trim() ||
    "";
  const raw = root.cloneNode(true);
  raw.querySelectorAll(drop).forEach((node) => node.remove());
  const canonical = document.querySelector("link[rel='canonical']")?.href?.trim();
  return {
    url: canonical && /^https?:\/\//i.test(canonical) ? canonical : location.href,
    title,
    author,
    content_md: (`# ${title}\n\n${text}`).slice(0, 2_000_000),
    content_raw: String(raw.outerHTML || "").slice(0, 2_000_000),
    source: location.hostname || "browser",
    type: "page",
    captured_at: new Date().toISOString(),
  };
}

export async function snapshotTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageSnapshot,
  });
  if (!result) throw new Error("failed to extract page snapshot");
  return result;
}
