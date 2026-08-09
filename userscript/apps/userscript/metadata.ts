export interface UserscriptMetadata {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  match: string[];
  connect: string[];
  grant: string[];
  runAt: string;
  license: string;
}

export const userscriptMetadata: UserscriptMetadata = {
  name: "Capture Flow",
  namespace: "https://github.com/xiaoqianran/capture-flow",
  version: "0.1.0",
  description:
    "Local Hub 页面捕获工作台：当前页入队 OpenCLI 采集、轮询 Job、可选 AI Recipe（Studio Dock）",
  author: "capture-flow",
  match: ["*://*/*"],
  connect: [
    "127.0.0.1",
    "localhost",
    "*",
  ],
  grant: [
    "unsafeWindow",
    "GM_xmlhttpRequest",
    "GM_setClipboard",
    "GM_addStyle",
    "GM_info",
    "GM_setValue",
    "GM_getValue",
    "GM_deleteValue",
  ],
  runAt: "document-idle",
  license: "MIT",
};

export function renderUserscriptMetadata(
  metadata: UserscriptMetadata = userscriptMetadata,
): string {
  const rows = [
    "// ==UserScript==",
    `// @name         ${metadata.name}`,
    `// @namespace    ${metadata.namespace}`,
    `// @version      ${metadata.version}`,
    `// @description  ${metadata.description}`,
    `// @author       ${metadata.author}`,
    ...metadata.match.map((value) => `// @match        ${value}`),
    ...metadata.connect.map((value) => `// @connect      ${value}`),
    ...metadata.grant.map((value) => `// @grant        ${value}`),
    `// @run-at       ${metadata.runAt}`,
    `// @license      ${metadata.license}`,
    "// ==/UserScript==",
  ];
  return rows.join("\n");
}
