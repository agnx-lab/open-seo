// 场景：OpenSEO Sub App 常量（AppId / 命令 / 面板 / ensure）。
export const OPEN_SEO_APP_ID = "com.agnx.open-seo";
export const OPEN_SEO_PANEL_ID = "open-seo.main";
export const OPEN_SEO_OPEN_COMMAND_ID = "open-seo.open";

/** 短跑 sidecar：复用或拉起 OpenSEO（默认本机 vite dev，对标 DSH 的 dsh web）。 */
export const OPEN_SEO_ENSURE_TOOL_REL = ".agnx/tools/ensure-open-seo.mjs";

/** 短跑 sidecar：读取 clone 根 git 分支与 HEAD。 */
export const OPEN_SEO_GIT_STATUS_TOOL_REL = ".agnx/tools/git-status-upstream.mjs";

/** 短跑 sidecar：受管 `git pull --ff-only`。 */
export const OPEN_SEO_GIT_PULL_TOOL_REL = ".agnx/tools/git-pull-upstream.mjs";

/** 短跑 sidecar：host.config 密钥 → `.env.local` 同步。 */
export const OPEN_SEO_SYNC_ENV_TOOL_REL = ".agnx/tools/sync-open-seo-env.mjs";

export const OPEN_SEO_CONFIG_KEY = "open-seo-app-config";

export const DEFAULT_OPEN_SEO_PORT = 3001;

export type OpenSeoRuntimeMode = "dev" | "preview" | "docker";
