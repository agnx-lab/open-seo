// 场景：OpenSEO 端口 / runtimeMode / 密钥经 host.config 落盘；面板 ensure 与详情配置共用。
import type { WorkspaceAppConfigApi } from "@agnx-lab/app-sdk";
import {
  DEFAULT_OPEN_SEO_PORT,
  OPEN_SEO_APP_ID,
  OPEN_SEO_CONFIG_KEY,
  type OpenSeoRuntimeMode,
} from "./constants";

export interface OpenSeoAppConfigDocument {
  version: 1;
  port: number;
  runtimeMode: OpenSeoRuntimeMode;
  /** DataForSEO API Key；落盘于 host.config 并同步到 `.env.local`。 */
  dataForSeoApiKey?: string;
  /** OpenRouter API Key（AI 功能可选）。 */
  openRouterApiKey?: string;
}

export function defaultOpenSeoAppConfigDocument(): OpenSeoAppConfigDocument {
  return { version: 1, port: DEFAULT_OPEN_SEO_PORT, runtimeMode: "dev" };
}

function normalizeRuntimeMode(raw: unknown): OpenSeoRuntimeMode {
  if (raw === "preview" || raw === "docker") {
    return raw;
  }
  return "dev";
}

function normalizeSecret(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOpenSeoAppConfigDocument(raw: unknown): OpenSeoAppConfigDocument {
  const defaults = defaultOpenSeoAppConfigDocument();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const doc = raw as Partial<OpenSeoAppConfigDocument>;
  const port = Number(doc.port);
  const runtimeMode = normalizeRuntimeMode(doc.runtimeMode);
  const dataForSeoApiKey = normalizeSecret(doc.dataForSeoApiKey);
  const openRouterApiKey = normalizeSecret(doc.openRouterApiKey);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return { ...defaults, runtimeMode, dataForSeoApiKey, openRouterApiKey };
  }
  return {
    version: 1,
    port: Math.floor(port),
    runtimeMode,
    dataForSeoApiKey,
    openRouterApiKey,
  };
}

export function isOpenSeoSecretConfigured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function loadOpenSeoConfigFromHost(
  config: WorkspaceAppConfigApi | null | undefined,
): Promise<OpenSeoAppConfigDocument> {
  if (!config?.get) {
    return defaultOpenSeoAppConfigDocument();
  }
  try {
    const raw = await config.get({
      scope: "app",
      appId: OPEN_SEO_APP_ID,
      key: OPEN_SEO_CONFIG_KEY,
      defaultValue: null,
    });
    return normalizeOpenSeoAppConfigDocument(raw);
  } catch {
    return defaultOpenSeoAppConfigDocument();
  }
}

export async function saveOpenSeoConfigToHost(
  config: WorkspaceAppConfigApi | null | undefined,
  patch: Partial<
    Pick<
      OpenSeoAppConfigDocument,
      "port" | "runtimeMode" | "dataForSeoApiKey" | "openRouterApiKey"
    >
  >,
): Promise<OpenSeoAppConfigDocument> {
  const current = await loadOpenSeoConfigFromHost(config);
  const merged = {
    ...current,
    ...patch,
  };
  if (patch.dataForSeoApiKey === "") {
    delete merged.dataForSeoApiKey;
  }
  if (patch.openRouterApiKey === "") {
    delete merged.openRouterApiKey;
  }
  const normalized = normalizeOpenSeoAppConfigDocument(merged);
  if (!config?.set) {
    return normalized;
  }
  await config.set({
    scope: "app",
    appId: OPEN_SEO_APP_ID,
    key: OPEN_SEO_CONFIG_KEY,
    value: normalized,
  });
  return normalized;
}
