#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 将 host.config 中的 OpenSEO 密钥同步到 clone 根 `.env.local`（vite/docker 读取）。
 * 用法：node agnx/tools/sync-open-seo-env.mjs [--status] [--agnx-home <path>]
 * stdout：单行 JSON { ok, envPath, hasDataForSeo, hasOpenRouter, synced? }
 */
import { access, constants as fsConstants, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const APP_ID = "com.agnx.open-seo";
const CONFIG_KEY = "open-seo-app-config";

function parseArgs(argv) {
  let statusOnly = false;
  let clearDataForSeo = false;
  let clearOpenRouter = false;
  let agnxHome = process.env.AGNX_HOME || "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--status") {
      statusOnly = true;
    } else if (arg === "--clear-dataforseo") {
      clearDataForSeo = true;
    } else if (arg === "--clear-openrouter") {
      clearOpenRouter = true;
    } else if ((arg === "--agnx-home" || arg === "--agnxHome") && next) {
      agnxHome = String(next).trim();
      i += 1;
    }
  }
  if (!agnxHome) {
    agnxHome = path.join(os.homedir(), ".agnx-dev");
  }
  return { statusOnly, clearDataForSeo, clearOpenRouter, agnxHome };
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function hostConfigPath(agnxHome) {
  return path.join(agnxHome, "apps", "data", APP_ID, "config", `${CONFIG_KEY}.json`);
}

function normalizeHostConfig(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const pickString = (value) => (typeof value === "string" ? value.trim() : "");
  return {
    dataForSeoApiKey: pickString(doc.dataForSeoApiKey),
    openRouterApiKey: pickString(doc.openRouterApiKey),
  };
}

async function loadHostSecrets(agnxHome) {
  const configPath = hostConfigPath(agnxHome);
  if (!(await pathExists(configPath))) {
    return { configPath, secrets: { dataForSeoApiKey: "", openRouterApiKey: "" } };
  }
  try {
    const raw = JSON.parse(await readFile(configPath, "utf8"));
    return { configPath, secrets: normalizeHostConfig(raw) };
  } catch {
    return { configPath, secrets: { dataForSeoApiKey: "", openRouterApiKey: "" } };
  }
}

function parseEnvKeys(raw) {
  const lines = raw.split(/\r?\n/);
  const keys = {};
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const name = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    keys[name] = value;
  }
  return keys;
}

function upsertEnvLines(raw, updates) {
  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = [];
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextLines.push(line);
      continue;
    }
    const key = match[1];
    if (!(key in updates)) {
      nextLines.push(line);
      continue;
    }
    const value = updates[key];
    if (value === null) {
      seen.add(key);
      continue;
    }
    if (value === "") {
      nextLines.push(line);
      continue;
    }
    seen.add(key);
    nextLines.push(`${key}=${value}`);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key) || value == null || value === "") {
      continue;
    }
    nextLines.push(`${key}=${value}`);
  }
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
    nextLines.pop();
  }
  return `${nextLines.join("\n")}\n`;
}

async function resolveEnvPath() {
  const envLocal = path.join(repoRoot, ".env.local");
  if (await pathExists(envLocal)) {
    return envLocal;
  }
  const envAlt = path.join(repoRoot, ".env");
  if (await pathExists(envAlt)) {
    return envAlt;
  }
  return envLocal;
}

async function readEnvStatus(envPath) {
  if (!(await pathExists(envPath))) {
    return { hasDataForSeo: false, hasOpenRouter: false };
  }
  const raw = await readFile(envPath, "utf8");
  const keys = parseEnvKeys(raw);
  return {
    hasDataForSeo: Boolean(keys.DATAFORSEO_API_KEY),
    hasOpenRouter: Boolean(keys.OPENROUTER_API_KEY),
  };
}

async function syncEnvFile(envPath, hostSecrets, options) {
  let raw = "";
  if (await pathExists(envPath)) {
    raw = await readFile(envPath, "utf8");
  } else if (await pathExists(path.join(repoRoot, ".env.example"))) {
    raw = await readFile(path.join(repoRoot, ".env.example"), "utf8");
  }

  const current = parseEnvKeys(raw);
  const updates = {
    AUTH_MODE: current.AUTH_MODE || "local_noauth",
    OPENSEO_TELEMETRY_DISABLED: current.OPENSEO_TELEMETRY_DISABLED || "1",
  };
  if (options.clearDataForSeo) {
    updates.DATAFORSEO_API_KEY = null;
  } else if (hostSecrets.dataForSeoApiKey) {
    updates.DATAFORSEO_API_KEY = hostSecrets.dataForSeoApiKey;
  }
  if (options.clearOpenRouter) {
    updates.OPENROUTER_API_KEY = null;
  } else if (hostSecrets.openRouterApiKey) {
    updates.OPENROUTER_API_KEY = hostSecrets.openRouterApiKey;
  }

  const merged = upsertEnvLines(raw, updates);
  await writeFile(envPath, merged, "utf8");
  return readEnvStatus(envPath);
}

async function main() {
  const { statusOnly, clearDataForSeo, clearOpenRouter, agnxHome } = parseArgs(process.argv.slice(2));
  const envPath = await resolveEnvPath();
  const { configPath, secrets } = await loadHostSecrets(agnxHome);

  if (statusOnly) {
    const envStatus = await readEnvStatus(envPath);
    const hostHasDataForSeo = Boolean(secrets.dataForSeoApiKey);
    const hostHasOpenRouter = Boolean(secrets.openRouterApiKey);
    console.log(
      JSON.stringify({
        ok: true,
        envPath,
        hostConfigPath: configPath,
        hasDataForSeo: envStatus.hasDataForSeo || hostHasDataForSeo,
        hasOpenRouter: envStatus.hasOpenRouter || hostHasOpenRouter,
        hostHasDataForSeo,
        hostHasOpenRouter,
        synced: false,
      }),
    );
    return;
  }

  const status = await syncEnvFile(envPath, secrets, { clearDataForSeo, clearOpenRouter });
  console.log(
    JSON.stringify({
      ok: true,
      envPath,
      hostConfigPath: configPath,
      hasDataForSeo: status.hasDataForSeo,
      hasOpenRouter: status.hasOpenRouter,
      synced: true,
    }),
  );
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      repoRoot,
    }),
  );
  process.exitCode = 1;
});
