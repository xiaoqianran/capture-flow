export interface BrowserSnapshot {
  url: string;
  title: string;
  author?: string;
  content_md: string;
  content_raw?: string;
  source?: string;
  type?: string;
  captured_at: string;
}

const DROP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "canvas",
  "iframe",
  "nav",
  "footer",
  "aside",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "#cf-root",
  "[aria-hidden='true']",
].join(",");

function metaContent(doc: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const value = doc.querySelector<HTMLMetaElement>(selector)?.content?.trim();
    if (value) return value;
  }
  return "";
}

function findContentRoot(doc: Document): Element {
  const candidates = [
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
  let best: Element | null = null;
  let bestLen = -1;
  for (const selector of candidates) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      const len = (el.textContent || "").trim().length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
    if (best && bestLen > 1200 && selector !== "body") break;
  }
  return best || doc.body || doc.documentElement;
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function visibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll(DROP_SELECTORS).forEach((node) => node.remove());

  // Preserve rough block structure before reading textContent from a detached clone.
  clone.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,br,section,div").forEach((node) => {
    if (node.tagName === "BR") {
      node.replaceWith("\n");
    } else {
      node.append("\n");
    }
  });
  return cleanText(clone.textContent || "");
}

export function extractBrowserSnapshot(doc: Document, href: string): BrowserSnapshot {
  const currentUrl = String(href || doc.location?.href || "").trim();
  const canonical = doc.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href?.trim();
  const url = canonical && /^https?:\/\//i.test(canonical) ? canonical : currentUrl;
  const root = findContentRoot(doc);
  const text = visibleText(root);
  const title =
    metaContent(doc, ["meta[property='og:title']", "meta[name='twitter:title']"]) ||
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.title?.trim() ||
    url;
  const author =
    metaContent(doc, [
      "meta[name='author']",
      "meta[property='article:author']",
      "meta[name='byl']",
    ]) || doc.querySelector("[rel='author']")?.textContent?.trim() || "";

  let source = "browser";
  try {
    source = new URL(url).hostname || source;
  } catch {
    /* backend validates URL */
  }

  const content = text || cleanText(doc.body?.innerText || doc.body?.textContent || "");
  if (!content) throw new Error("页面正文为空，无法创建 Snapshot");
  const contentMd = title && !content.startsWith(`# ${title}`) ? `# ${title}\n\n${content}` : content;
  const raw = root.cloneNode(true) as Element;
  raw.querySelectorAll(DROP_SELECTORS).forEach((node) => node.remove());

  return {
    url,
    title,
    ...(author ? { author } : {}),
    content_md: contentMd.slice(0, 2_000_000),
    content_raw: raw.outerHTML.slice(0, 2_000_000),
    source,
    type: "page",
    captured_at: new Date().toISOString(),
  };
}
