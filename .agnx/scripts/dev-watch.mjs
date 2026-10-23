#!/usr/bin/env node
// 场景：外置 OpenSEO 子应用调试 — watch agnx 胶水、build dist、写出 .agnx-debug-rev 驱动宿主 remount。
import { watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const agnxDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.resolve(agnxDir, "..");
const revPath = path.join(appDir, ".agnx-debug-rev");
const watchRoots = [
  path.join(agnxDir, "src"),
  path.join(agnxDir, "tools"),
  path.join(appDir, "manifest.json"),
  path.join(agnxDir, "package.json"),
];

let revision = 0;
let writing = false;
let building = false;

async function runBuild() {
  if (building) {
    return;
  }
  building = true;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(agnxDir, "scripts/build.mjs")], {
        cwd: agnxDir,
        stdio: "inherit",
      });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error(`build exit ${code}`));
        }
      });
    });
  } catch (error) {
    console.error("[open-seo dev-watch] build failed", error);
  } finally {
    building = false;
  }
}

async function bump(reason) {
  if (writing) {
    return;
  }
  writing = true;
  revision += 1;
  const payload = `${JSON.stringify({
    revision,
    reason,
    at: new Date().toISOString(),
  })}\n`;
  try {
    await runBuild();
    await writeFile(revPath, payload, "utf8");
    console.log(`[open-seo dev-watch] rev=${revision} (${reason}) → ${revPath}`);
  } catch (error) {
    console.error("[open-seo dev-watch] failed to write rev file", error);
  } finally {
    writing = false;
  }
}

await mkdir(appDir, { recursive: true });
await bump("start");

for (const root of watchRoots) {
  try {
    watch(root, { recursive: true }, (_event, filename) => {
      const name = filename ? String(filename) : "";
      if (name.includes("node_modules") || name.endsWith(".agnx-debug-rev")) {
        return;
      }
      void bump(name || root);
    });
  } catch (error) {
    console.warn(`[open-seo dev-watch] cannot watch ${root}`, error);
  }
}

console.log("[open-seo dev-watch] 调试会话常驻。改 agnx/src 会 build + bump rev；Ctrl+C 结束。");
console.log("[open-seo dev-watch] watching", watchRoots.join(", "));
