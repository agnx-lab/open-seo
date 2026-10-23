// 场景：OpenSEO 运行时协调 — 配置/pull 后通知面板停旧再起（W3）。
export type OpenSeoRuntimeRestartReason =
  | "port"
  | "runtime-mode"
  | "git-pull"
  | "secrets"
  | "manual";

type RestartListener = (reason: OpenSeoRuntimeRestartReason) => void;

const listeners = new Set<RestartListener>();

export function subscribeOpenSeoRuntimeRestart(listener: RestartListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyOpenSeoRuntimeNeedsRestart(reason: OpenSeoRuntimeRestartReason): void {
  for (const listener of listeners) {
    listener(reason);
  }
}
