// 场景：OpenSEO Sub App 入口 — 薄壳 + ensure + iframe（W1）。
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import { OpenSeoIcon } from "./open-seo-icon";
import {
  OPEN_SEO_APP_ID,
  OPEN_SEO_ENSURE_TOOL_REL,
  OPEN_SEO_GIT_PULL_TOOL_REL,
  OPEN_SEO_GIT_STATUS_TOOL_REL,
  OPEN_SEO_OPEN_COMMAND_ID,
  OPEN_SEO_PANEL_ID,
} from "./constants";
import { registerOpenSeoDetailConfig } from "./detail-config";
import { bindOpenSeoHarnessHost, OpenSeoPanel } from "./panel";

export const appId = OPEN_SEO_APP_ID;

function openOpenSeoTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openMiniAppTab({
    appId: OPEN_SEO_APP_ID,
    panelId: OPEN_SEO_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): void {
  bindOpenSeoHarnessHost(host);
  registerOpenSeoDetailConfig(host);

  host.registerMiniApp({
    id: OPEN_SEO_PANEL_ID,
    appId: OPEN_SEO_APP_ID,
    title: "OpenSEO",
    icon: OpenSeoIcon,
    component: OpenSeoPanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [
        OPEN_SEO_ENSURE_TOOL_REL,
        OPEN_SEO_GIT_STATUS_TOOL_REL,
        OPEN_SEO_GIT_PULL_TOOL_REL,
      ],
      note: "Tab iframe 加载本仓受管 OpenSEO；ensure 默认本机 vite dev",
    },
  });

  host.registerCommand({
    id: OPEN_SEO_OPEN_COMMAND_ID,
    appId: OPEN_SEO_APP_ID,
    title: "OpenSEO",
    keywords: ["open-seo", "openseo", "seo", "关键词", "外链", "审计"],
    icon: OpenSeoIcon,
    sidebarAction: {
      defaultVisible: true,
      label: "SEO",
      order: 62,
    },
    run: (context) => {
      openOpenSeoTab(host, context);
    },
  });
}

const moduleExport: WorkspaceAppModule = {
  appId: OPEN_SEO_APP_ID,
  activate,
};

export default moduleExport;

export { OPEN_SEO_APP_ID, OPEN_SEO_OPEN_COMMAND_ID, OPEN_SEO_PANEL_ID } from "./constants";
export { OpenSeoPanel } from "./panel";
