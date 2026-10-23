#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 读取 clone 根 git 分支名与短 HEAD（详情配置展示）。
 * stdout：单行 JSON { ok, head, branch, repoRoot }
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  return stdout.trim();
}

async function main() {
  try {
    const head = await runGit(["rev-parse", "--short", "HEAD"]);
    let branch = "";
    try {
      branch = await runGit(["branch", "--show-current"]);
    } catch {
      branch = "";
    }
    console.log(
      JSON.stringify({
        ok: true,
        head,
        branch: branch || "（无分支名）",
        repoRoot,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        repoRoot,
      }),
    );
    process.exitCode = 1;
  }
}

main();
