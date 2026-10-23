#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 确保本仓 OpenSEO 已起（默认本机 vite dev，对标 DSH dsh web）。
 * 用法：node agnx/tools/ensure-open-seo.mjs [--work-dir <dataRoot>] [--port <n>] [--mode dev|preview|docker] [--force-restart] [--supervised]
 * stdout：单行 JSON { ok, port, origin, reused, mode, warnings? }；--supervised 时含 plan 供 daemon spawn
 */
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, constants as fsConstants, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** clone 根 = open-seo 仓根 */
const repoRoot = path.resolve(__dirname, "../..");
const defaultPort = 3001;

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let port = defaultPort;
  let mode = "dev";
  let forceRestart = false;
  let supervised = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) {
        port = n;
      }
      i += 1;
    } else if ((arg === "--mode" || arg === "--runtimeMode") && next) {
      if (next === "preview" || next === "docker") {
        mode = next;
      } else {
        mode = "dev";
      }
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    }
  }
  return {
    workDir: workDir || path.join(repoRoot, ".agnx-open-seo-runtime"),
    port,
    mode,
    repoRoot,
    forceRestart,
    supervised,
  };
}

function fingerprint(cfg, envHash) {
  return JSON.stringify({ repoRoot: cfg.repoRoot, port: cfg.port, mode: cfg.mode, envHash });
}

async function hashEnvFile(envPath) {
  if (!(await pathExists(envPath))) {
    return "missing";
  }
  const raw = await readFile(envPath, "utf8");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

async function resolveEnvPathForFingerprint() {
  const envLocal = path.join(repoRoot, ".env.local");
  if (await pathExists(envLocal)) {
    return envLocal;
  }
  return path.join(repoRoot, ".env");
}

async function syncEnvFromHostConfig(agnxHome) {
  const syncScript = path.join(__dirname, "sync-open-seo-env.mjs");
  if (!(await pathExists(syncScript))) {
    return { ok: true, skipped: true };
  }
  const args = [syncScript];
  if (agnxHome) {
    args.push("--agnx-home", agnxHome);
  }
  try {
    await execFileAsync(process.execPath, args, {
      cwd: repoRoot,
      timeout: 30_000,
      maxBuffer: 512 * 1024,
    });
    return { ok: true, skipped: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg.slice(0, 400) };
  }
}

async function readState(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isWebHealthy(port) {
  if (await httpGetOk(`http://127.0.0.1:${port}/api/health`)) {
    return true;
  }
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

async function waitForHealth(port, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isWebHealthy(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readEnvKeyPresent(envPath) {
  if (!(await pathExists(envPath))) {
    return { exists: false, hasDataForSeo: false };
  }
  const raw = await readFile(envPath, "utf8");
  const hasDataForSeo = /(?:^|\n)\s*DATAFORSEO_API_KEY\s*=\s*\S+/m.test(raw);
  return { exists: true, hasDataForSeo };
}

async function dockerAvailable() {
  try {
    await execFileAsync("docker", ["info"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) {
    return;
  }
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // ignore
  }
}

function spawnDetached(command, args, { cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { child, getStderr: () => "" };
}

async function resolveViteBin(repoRoot) {
  const bin = path.join(repoRoot, "node_modules", ".bin", "vite");
  if (await pathExists(bin)) {
    return bin;
  }
  return null;
}

async function ensureNodeDev(cfg, warnings, statePath, { command, args, needBuildHint }) {
  const envLocal = path.join(cfg.repoRoot, ".env.local");
  const envAlt = path.join(cfg.repoRoot, ".env");
  const envInfo = (await pathExists(envLocal))
    ? await readEnvKeyPresent(envLocal)
    : await readEnvKeyPresent(envAlt);
  if (!envInfo.exists) {
    return {
      ok: false,
      error:
        "缺少 .env.local 或 .env。请 cp .env.example .env.local 并设置 AUTH_MODE=local_noauth（见 docs/LOCAL_DEVELOPMENT.md）",
    };
  }
  if (!envInfo.hasDataForSeo) {
    warnings.push("DATAFORSEO_API_KEY 未配置或为空");
  }

  const viteBin = await resolveViteBin(cfg.repoRoot);
  if (!viteBin) {
    return {
      ok: false,
      error:
        "未找到 node_modules/.bin/vite。请在本仓根目录执行：corepack enable && pnpm install --frozen-lockfile && pnpm run db:migrate:local",
    };
  }

  const existing = await readState(statePath);
  if (existing?.pid) {
    stopPid(existing.pid);
  }

  const { child, getStderr } = spawnDetached(command, args, {
    cwd: cfg.repoRoot,
    env: {
      ...process.env,
      PORT: String(cfg.port),
      AUTH_MODE: process.env.AUTH_MODE || "local_noauth",
      OPENSEO_TELEMETRY_DISABLED: process.env.OPENSEO_TELEMETRY_DISABLED || "1",
    },
  });

  const ready = await waitForHealth(cfg.port, 120_000);
  if (!ready) {
    stopPid(child.pid);
    const stderr = getStderr().trim();
    return {
      ok: false,
      error: stderr
        ? `${needBuildHint} 启动超时：${stderr.slice(0, 400)}`
        : `${needBuildHint} 启动超时`,
      pid: child.pid ?? null,
    };
  }
  return { ok: true, pid: child.pid ?? null };
}

async function ensureDev(cfg, warnings, statePath) {
  const viteEntry = path.join(cfg.repoRoot, "node_modules", "vite", "bin", "vite.js");
  if (!(await pathExists(viteEntry))) {
    return {
      ok: false,
      error:
        "未找到 vite。请在本仓根目录执行：corepack enable && pnpm install --frozen-lockfile && pnpm run db:migrate:local",
    };
  }
  return ensureNodeDev(cfg, warnings, statePath, {
    command: process.execPath,
    args: [viteEntry, "dev", "--host", "127.0.0.1", "--port", String(cfg.port)],
    needBuildHint: "vite dev",
  });
}

async function ensureDocker(cfg, warnings) {
  if (!(await dockerAvailable())) {
    return {
      ok: false,
      error: "未检测到 Docker。本地开发请用 runtimeMode=dev（默认）；Docker 仅高级自托管。",
    };
  }
  const composeFile = path.join(cfg.repoRoot, "compose.yaml");
  if (!(await pathExists(composeFile))) {
    return { ok: false, error: `缺少 compose.yaml：${composeFile}` };
  }

  const envPath = path.join(cfg.repoRoot, ".env");
  const envInfo = await readEnvKeyPresent(envPath);
  if (!envInfo.exists) {
    return {
      ok: false,
      error: "缺少 .env。请在仓根执行：cp .env.example .env 并填写 DATAFORSEO_API_KEY",
    };
  }
  if (!envInfo.hasDataForSeo) {
    warnings.push("DATAFORSEO_API_KEY 未配置或为空；SEO 数据接口可能不可用");
  }

  const composeArgs = ["compose", "up", "-d"];
  if (cfg.forceRestart) {
    composeArgs.push("--force-recreate");
  }
  try {
    await execFileAsync("docker", composeArgs, {
      cwd: cfg.repoRoot,
      env: {
        ...process.env,
        PORT: String(cfg.port),
        AUTH_MODE: process.env.AUTH_MODE || "local_noauth",
        OPENSEO_TELEMETRY_DISABLED: process.env.OPENSEO_TELEMETRY_DISABLED || "1",
      },
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr || "") : "";
    return {
      ok: false,
      error: `docker compose 失败：${(stderr || msg).slice(0, 500)}`,
    };
  }

  const ready = await waitForHealth(cfg.port, 150_000);
  if (!ready) {
    return {
      ok: false,
      error: `OpenSEO Docker 启动超时（port=${cfg.port}）。请查看：docker compose logs -f`,
    };
  }
  return { ok: true };
}

async function ensurePreview(cfg, warnings, statePath) {
  return ensureNodeDev(cfg, warnings, statePath, {
    command: "pnpm",
    args: ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(cfg.port)],
    needBuildHint: "vite preview（需先 pnpm run build）",
  });
}

const ENSURE_LOCK_WAIT_MS = 180_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryReusedResponse(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) {
    return null;
  }
  const existing = await readState(statePath);
  if (!existing || !(await isWebHealthy(cfg.port))) {
    return null;
  }
  if (existing.fingerprint !== wantedFp) {
    return null;
  }
  return {
    ok: true,
    reused: true,
    port: cfg.port,
    mode: cfg.mode,
    pid: existing.pid ?? null,
    origin: `http://127.0.0.1:${cfg.port}`,
    repoRoot: cfg.repoRoot,
    warnings: existing.warnings || [],
  };
}

async function withEnsureLock(workDir, cfg, statePath, wantedFp, run) {
  const lockDir = path.join(workDir, "ensure-open-seo.lock");
  const deadline = Date.now() + ENSURE_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await mkdir(lockDir);
      try {
        return await run();
      } finally {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      const reused = await tryReusedResponse(cfg, statePath, wantedFp);
      if (reused) {
        return reused;
      }
      await sleep(300);
    }
  }
  throw new Error("ensure 等待锁超时");
}

async function runEnsureBody(cfg, statePath, warnings, wantedFp) {
  const reused = await tryReusedResponse(cfg, statePath, wantedFp);
  if (reused) {
    return reused;
  }

  let result;
  if (cfg.mode === "preview") {
    result = await ensurePreview(cfg, warnings, statePath);
  } else if (cfg.mode === "docker") {
    result = await ensureDocker(cfg, warnings);
  } else {
    result = await ensureDev(cfg, warnings, statePath);
  }

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      port: cfg.port,
      mode: cfg.mode,
      repoRoot: cfg.repoRoot,
    };
  }

  const state = {
    fingerprint: wantedFp,
    port: cfg.port,
    mode: cfg.mode,
    pid: result.pid ?? null,
    repoRoot: cfg.repoRoot,
    warnings,
    updatedAt: Date.now(),
  };
  await writeState(statePath, state);

  return {
    ok: true,
    reused: false,
    port: cfg.port,
    mode: cfg.mode,
    pid: result.pid ?? null,
    origin: `http://127.0.0.1:${cfg.port}`,
    repoRoot: cfg.repoRoot,
    warnings,
  };
}

async function buildSupervisedPlan(cfg, warnings, wantedFp) {
  if (cfg.mode === "docker") {
    return {
      ok: false,
      error: "Docker 模式已废弃；请使用 dev 或 preview（由 daemon 托管 loopback sidecar）",
      port: cfg.port,
      mode: cfg.mode,
      repoRoot: cfg.repoRoot,
    };
  }
  const envLocal = path.join(cfg.repoRoot, ".env.local");
  const envAlt = path.join(cfg.repoRoot, ".env");
  const envInfo = (await pathExists(envLocal))
    ? await readEnvKeyPresent(envLocal)
    : await readEnvKeyPresent(envAlt);
  if (!envInfo.exists) {
    return {
      ok: false,
      error:
        "缺少 .env.local 或 .env。请 cp .env.example .env.local 并设置 AUTH_MODE=local_noauth（见 docs/LOCAL_DEVELOPMENT.md）",
    };
  }
  if (!envInfo.hasDataForSeo) {
    warnings.push("DATAFORSEO_API_KEY 未配置或为空");
  }
  const healthUrl = `http://127.0.0.1:${cfg.port}/api/health`;
  if (cfg.mode === "preview") {
    return {
      ok: true,
      plan: {
        command: "pnpm",
        args: ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(cfg.port)],
        cwd: cfg.repoRoot,
        env: {
          PORT: String(cfg.port),
          AUTH_MODE: process.env.AUTH_MODE || "local_noauth",
          OPENSEO_TELEMETRY_DISABLED: process.env.OPENSEO_TELEMETRY_DISABLED || "1",
        },
        fingerprint: wantedFp,
        healthUrl,
        port: cfg.port,
        launchMode: cfg.mode,
      },
    };
  }
  const viteEntry = path.join(cfg.repoRoot, "node_modules", "vite", "bin", "vite.js");
  if (!(await pathExists(viteEntry))) {
    return {
      ok: false,
      error:
        "未找到 vite。请在本仓根目录执行：corepack enable && pnpm install --frozen-lockfile && pnpm run db:migrate:local",
    };
  }
  return {
    ok: true,
    plan: {
      command: process.execPath,
      args: [viteEntry, "dev", "--host", "127.0.0.1", "--port", String(cfg.port)],
      cwd: cfg.repoRoot,
      env: {
        PORT: String(cfg.port),
        AUTH_MODE: process.env.AUTH_MODE || "local_noauth",
        OPENSEO_TELEMETRY_DISABLED: process.env.OPENSEO_TELEMETRY_DISABLED || "1",
      },
      fingerprint: wantedFp,
      healthUrl,
      port: cfg.port,
      launchMode: cfg.mode,
    },
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const warnings = [];
  await mkdir(cfg.workDir, { recursive: true });
  const statePath = path.join(cfg.workDir, "open-seo.json");

  const agnxHome =
    process.env.AGNX_HOME ||
    (cfg.workDir.includes(`${path.sep}apps${path.sep}data${path.sep}`)
      ? path.resolve(cfg.workDir, "../../..")
      : path.join(process.env.HOME || repoRoot, ".agnx-dev"));
  const syncResult = await syncEnvFromHostConfig(agnxHome);
  if (!syncResult.ok) {
    warnings.push(`密钥同步失败：${syncResult.error}`);
  }

  const envPath = await resolveEnvPathForFingerprint();
  const envHash = await hashEnvFile(envPath);
  const wantedFp = fingerprint(cfg, envHash);

  if (cfg.supervised) {
    const reused = await tryReusedResponse(cfg, statePath, wantedFp);
    if (reused) {
      console.log(
        JSON.stringify({
          ...reused,
          healthUrl: `http://127.0.0.1:${cfg.port}/api/health`,
        }),
      );
      return;
    }
    const planned = await buildSupervisedPlan(cfg, warnings, wantedFp);
    if (!planned.ok) {
      console.log(JSON.stringify({ ...planned, repoRoot: cfg.repoRoot, mode: cfg.mode, warnings }));
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({
        ok: true,
        reused: false,
        plan: planned.plan,
        warnings,
        repoRoot: cfg.repoRoot,
        mode: cfg.mode,
      }),
    );
    return;
  }

  const response = await withEnsureLock(cfg.workDir, cfg, statePath, wantedFp, () =>
    runEnsureBody(cfg, statePath, warnings, wantedFp),
  );

  console.log(JSON.stringify(response));
  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
