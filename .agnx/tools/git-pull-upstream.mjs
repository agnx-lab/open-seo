#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 受管 git pull --ff-only（禁止 reset/checkout 等破坏性命令）。
 * stdout：单行 JSON { ok, beforeHead, afterHead, branch, summary, repoRoot, changed }
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
    timeout: 180_000,
    maxBuffer: 2_000_000,
  });
  return stdout.trim();
}

async function main() {
  try {
    const beforeHead = await runGit(["rev-parse", "--short", "HEAD"]);
    let branch = "";
    try {
      branch = await runGit(["branch", "--show-current"]);
    } catch {
      branch = "";
    }
    const summary = await runGit(["pull", "--ff-only"]);
    const afterHead = await runGit(["rev-parse", "--short", "HEAD"]);
    console.log(
      JSON.stringify({
        ok: true,
        beforeHead,
        afterHead,
        branch: branch || "（无分支名）",
        summary,
        repoRoot,
        changed: beforeHead !== afterHead,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      JSON.stringify({
        ok: false,
        error: message.includes("Not possible to fast-forward")
          ? "git pull 失败：本地与远程分叉，请手动处理冲突后再试（仅允许 --ff-only）"
          : message,
        repoRoot,
      }),
    );
    process.exitCode = 1;
  }
}

main();
