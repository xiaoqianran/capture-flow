import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { build } from "vite";

import {
  renderUserscriptMetadata,
  userscriptMetadata,
} from "../apps/userscript/metadata";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist/userscript");
const buildDirectory = resolve(outputDirectory, ".build");
const bundlePath = resolve(buildDirectory, "capture-flow.bundle.js");
const productionOutputPath = resolve(outputDirectory, "capture-flow.user.js");

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex").toUpperCase();
}

async function buildBundle(): Promise<string> {
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await build({
    configFile: resolve(projectRoot, "apps/userscript/vite.config.ts"),
    root: projectRoot,
    logLevel: "warn",
  });
  return readFile(bundlePath, "utf8");
}

async function main(): Promise<void> {
  const bootstrap = await buildBundle();
  // Guard: product bundle must not depend on bare import statements (userscript IIFE).
  if (/^\s*import\s+/m.test(bootstrap)) {
    throw new Error("Userscript bundle still contains ESM import statements");
  }

  const output = [
    renderUserscriptMetadata(userscriptMetadata),
    "",
    `// Capture Flow monorepo userscript (${userscriptMetadata.version})`,
    `// Architecture: Host → Runtime Ports → Hub Client → Studio UI`,
    `// Build: pure monorepo product (no legacy body)`,
    bootstrap.trim(),
    "",
  ].join("\n");

  if (!output.includes("// ==UserScript==") || !output.includes("CaptureFlow")) {
    throw new Error("Userscript output failed basic integrity checks");
  }

  await writeFile(productionOutputPath, output, "utf8");
  await rm(buildDirectory, { recursive: true, force: true });
  console.log(
    `Built ${productionOutputPath} (${Buffer.byteLength(output)} bytes, sha256 ${sha256(output)})`,
  );
}

void main();
