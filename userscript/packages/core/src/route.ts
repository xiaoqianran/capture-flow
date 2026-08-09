export type CaptureSiteHint = "zhihu" | "bilibili" | "generic" | "unsupported";

export interface PageRouteInfo {
  href: string;
  site: CaptureSiteHint;
  canCapture: boolean;
  reason?: string;
}

export function detectPageRoute(href: string): PageRouteInfo {
  const url = String(href || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return {
      href: url,
      site: "unsupported",
      canCapture: false,
      reason: "仅支持 http(s) 页面",
    };
  }
  const lower = url.toLowerCase();
  if (lower.includes("zhihu.com")) {
    const isAnswer = /\/answer\/\d+/i.test(url) || /zhuanlan\.zhihu\.com\/p\/\d+/i.test(url);
    return {
      href: url,
      site: "zhihu",
      canCapture: isAnswer || true,
      reason: isAnswer
        ? undefined
        : "知乎问题页可提交，但 Hub 可能要求回答/专栏链接",
    };
  }
  if (lower.includes("bilibili.com")) {
    return { href: url, site: "bilibili", canCapture: true };
  }
  return { href: url, site: "generic", canCapture: true };
}
