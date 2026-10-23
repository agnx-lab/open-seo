// 场景：详情配置保存后调用 sidecar，将 host.config 密钥同步到 `.env.local`。
import { OPEN_SEO_APP_ID, OPEN_SEO_SYNC_ENV_TOOL_REL } from "./constants";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";

export type OpenSeoEnvSyncStatus = {
  hasDataForSeo: boolean;
  hasOpenRouter: boolean;
  hostHasDataForSeo?: boolean;
  hostHasOpenRouter?: boolean;
  envPath?: string;
};

function parseSyncPayload(result: {
  ok?: boolean;
  resultJson?: unknown;
  stdout?: string;
  stderr?: string;
}): OpenSeoEnvSyncStatus | { error: string } {
  const pick = (record: {
    ok?: unknown;
    hasDataForSeo?: unknown;
    hasOpenRouter?: unknown;
    hostHasDataForSeo?: unknown;
    hostHasOpenRouter?: unknown;
    envPath?: unknown;
    error?: unknown;
  }): OpenSeoEnvSyncStatus | { error: string } | null => {
    if (record.ok === false) {
      return { error: typeof record.error === "string" ? record.error : "sync 返回失败" };
    }
    return {
      hasDataForSeo: record.hasDataForSeo === true,
      hasOpenRouter: record.hasOpenRouter === true,
      hostHasDataForSeo: record.hostHasDataForSeo === true,
      hostHasOpenRouter: record.hostHasOpenRouter === true,
      envPath: typeof record.envPath === "string" ? record.envPath : undefined,
    };
  };

  const json = result.resultJson;
  if (json && typeof json === "object" && json !== null) {
    const fromJson = pick(json as Record<string, unknown>);
    if (fromJson) {
      return fromJson;
    }
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const fromLine = pick(parsed);
      if (fromLine) {
        return fromLine;
      }
    } catch {
      // continue
    }
  }
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  return { error: stderr ? stderr.slice(0, 240) : "无法解析 sync 输出" };
}

export async function readOpenSeoEnvStatus(
  host: WorkspaceAppHostApi,
): Promise<OpenSeoEnvSyncStatus | { error: string }> {
  if (!host.tools?.run) {
    return { error: "需桌面端 host.tools" };
  }
  const result = await host.tools.run({
    appId: OPEN_SEO_APP_ID,
    tool: OPEN_SEO_SYNC_ENV_TOOL_REL,
    args: ["--status"],
    timeoutMs: 30_000,
  });
  return parseSyncPayload(result);
}

export async function syncOpenSeoEnvFromHostConfig(
  host: WorkspaceAppHostApi,
  options?: { clearDataForSeo?: boolean; clearOpenRouter?: boolean },
): Promise<OpenSeoEnvSyncStatus | { error: string }> {
  if (!host.tools?.run) {
    return { error: "需桌面端 host.tools" };
  }
  const args: string[] = [];
  if (options?.clearDataForSeo) {
    args.push("--clear-dataforseo");
  }
  if (options?.clearOpenRouter) {
    args.push("--clear-openrouter");
  }
  const result = await host.tools.run({
    appId: OPEN_SEO_APP_ID,
    tool: OPEN_SEO_SYNC_ENV_TOOL_REL,
    args: args.length > 0 ? args : undefined,
    timeoutMs: 30_000,
  });
  return parseSyncPayload(result);
}
