// 场景：详情「配置」— 端口、runtimeMode、API 密钥、上游 git（W2）；RN + 主题 Chip，适配深色详情 sheet。
import { createElement, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import {
  DEFAULT_OPEN_SEO_PORT,
  OPEN_SEO_APP_ID,
  OPEN_SEO_GIT_PULL_TOOL_REL,
  OPEN_SEO_GIT_STATUS_TOOL_REL,
  type OpenSeoRuntimeMode,
} from "./constants";
import { getBoundHost } from "./host-bind";
import {
  defaultOpenSeoAppConfigDocument,
  isOpenSeoSecretConfigured,
  loadOpenSeoConfigFromHost,
  saveOpenSeoConfigToHost,
  type OpenSeoAppConfigDocument,
} from "./open-seo-config";
import { readOpenSeoEnvStatus, syncOpenSeoEnvFromHostConfig } from "./open-seo-env-sync";
import { notifyOpenSeoRuntimeNeedsRestart } from "./open-seo-runtime-coordinator";

let cachedConfig: OpenSeoAppConfigDocument = defaultOpenSeoAppConfigDocument();

export function getCachedOpenSeoConfig(): OpenSeoAppConfigDocument {
  return cachedConfig;
}

function setCachedOpenSeoConfig(next: OpenSeoAppConfigDocument): void {
  cachedConfig = next;
}

function useDetailLayoutStyles() {
  const { theme } = useUnistyles();
  const dark = theme.colorScheme !== "light";
  return useMemo(() => {
    const column: ViewStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      alignSelf: "stretch",
      width: "100%",
      gap: 8,
      minWidth: 0,
    };
    const row: ViewStyle = {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    };
    const muted: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foregroundMuted,
    };
    const mono: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foreground,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
    const ok: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusSuccess || "#15803d",
    };
    const warn: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusWarning || theme.colors.statusDanger,
    };
    const input = (focused: boolean): TextStyle => ({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 72,
      fontSize: 12,
      lineHeight: 16,
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 32,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: theme.colors.foreground,
      borderColor: focused
        ? theme.colors.accent
        : dark
          ? "rgba(255,255,255,0.35)"
          : "rgba(0,0,0,0.22)",
      backgroundColor: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.92)",
    });
    const secretInput = (focused: boolean): TextStyle => ({
      ...input(focused),
      flexBasis: "auto",
      width: "100%",
      maxWidth: 420,
      alignSelf: "stretch",
    });
    return { column, row, muted, mono, ok, warn, input, secretInput };
  }, [dark, theme]);
}

function parseToolJson(result: {
  ok?: boolean;
  resultJson?: unknown;
  stdout?: string;
  stderr?: string;
}): Record<string, unknown> | null {
  const json = result.resultJson;
  if (json && typeof json === "object" && json !== null) {
    return json as Record<string, unknown>;
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  if (stderr) {
    return { ok: false, error: stderr.slice(0, 400) };
  }
  return null;
}

function DetailChip({
  label,
  busy,
  disabled,
  tone,
  onPress,
  testID,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "default";
  onPress: () => void;
  testID?: string;
}): ReactElement | null {
  const Chip = getBoundHost()?.ui?.Chip;
  if (!Chip) {
    return null;
  }
  return createElement(Chip, {
    label: busy ? "…" : label,
    tone: tone ?? "default",
    busy,
    disabled: disabled || busy,
    onPress,
    testID,
    accessibilityLabel: label,
  });
}

function RuntimeDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [portText, setPortText] = useState(String(cachedConfig.port));
  const [runtimeMode, setRuntimeMode] = useState<OpenSeoRuntimeMode>(cachedConfig.runtimeMode);
  const [portFocused, setPortFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const host = getBoundHost();
        if (!host) {
          return;
        }
        const loaded = await loadOpenSeoConfigFromHost(host.config);
        if (cancelled) {
          return;
        }
        setCachedOpenSeoConfig(loaded);
        setPortText(String(loaded.port));
        setRuntimeMode(loaded.runtimeMode);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      return;
    }
    const port = Number(portText.trim());
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      setError("端口须为 1–65535 的整数");
      return;
    }
    setBusy(true);
    setError(null);
    const before = cachedConfig;
    try {
      const saved = await saveOpenSeoConfigToHost(host.config, { port, runtimeMode });
      setCachedOpenSeoConfig(saved);
      setPortText(String(saved.port));
      setRuntimeMode(saved.runtimeMode);
      if (saved.port !== before.port) {
        notifyOpenSeoRuntimeNeedsRestart("port");
      }
      if (saved.runtimeMode !== before.runtimeMode) {
        notifyOpenSeoRuntimeNeedsRestart("runtime-mode");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [portText, runtimeMode]);

  const modes: OpenSeoRuntimeMode[] = ["dev", "preview", "docker"];
  const modeLabel: Record<OpenSeoRuntimeMode, string> = {
    dev: "dev",
    preview: "preview",
    docker: "docker",
  };

  return (
    <View style={styles.column} testID="open-seo-runtime-field">
      <Text style={styles.muted}>
        默认 dev：本机 vite dev（对标 DSH，无需 Docker）。preview = 构建后预览；docker = 高级自托管。
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input(portFocused)}
          value={portText}
          onChangeText={setPortText}
          onFocus={() => setPortFocused(true)}
          onBlur={() => setPortFocused(false)}
          keyboardType="number-pad"
          placeholder={String(DEFAULT_OPEN_SEO_PORT)}
          accessibilityLabel="OpenSEO 端口"
        />
        {modes.map((mode) => (
          <DetailChip
            key={mode}
            label={modeLabel[mode]}
            tone={runtimeMode === mode ? "accent" : "default"}
            disabled={busy}
            onPress={() => setRuntimeMode(mode)}
            testID={`open-seo-mode-${mode}`}
          />
        ))}
        <DetailChip label="保存" tone="accent" busy={busy} onPress={() => void onSave()} testID="open-seo-runtime-save" />
      </View>
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function SecretsDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [dataForSeoInput, setDataForSeoInput] = useState("");
  const [openRouterInput, setOpenRouterInput] = useState("");
  const [dataForSeoFocused, setDataForSeoFocused] = useState(false);
  const [openRouterFocused, setOpenRouterFocused] = useState(false);
  const [hasDataForSeo, setHasDataForSeo] = useState(false);
  const [hasOpenRouter, setHasOpenRouter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      return;
    }
    try {
      const cfg = await loadOpenSeoConfigFromHost(host.config);
      setCachedOpenSeoConfig(cfg);
      const envStatus = await readOpenSeoEnvStatus(host);
      if ("error" in envStatus) {
        setHasDataForSeo(isOpenSeoSecretConfigured(cfg.dataForSeoApiKey));
        setHasOpenRouter(isOpenSeoSecretConfigured(cfg.openRouterApiKey));
        return;
      }
      setHasDataForSeo(
        isOpenSeoSecretConfigured(cfg.dataForSeoApiKey) || envStatus.hasDataForSeo,
      );
      setHasOpenRouter(
        isOpenSeoSecretConfigured(cfg.openRouterApiKey) || envStatus.hasOpenRouter,
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      return;
    }
    const dataForSeoTrimmed = dataForSeoInput.trim();
    const openRouterTrimmed = openRouterInput.trim();
    if (!dataForSeoTrimmed && !openRouterTrimmed) {
      setError("请填写至少一项密钥（留空表示不修改已有值）");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    const before = cachedConfig;
    try {
      const patch: Partial<
        Pick<OpenSeoAppConfigDocument, "dataForSeoApiKey" | "openRouterApiKey">
      > = {};
      if (dataForSeoTrimmed) {
        patch.dataForSeoApiKey = dataForSeoTrimmed;
      }
      if (openRouterTrimmed) {
        patch.openRouterApiKey = openRouterTrimmed;
      }
      const saved = await saveOpenSeoConfigToHost(host.config, patch);
      setCachedOpenSeoConfig(saved);
      const synced = await syncOpenSeoEnvFromHostConfig(host);
      if ("error" in synced) {
        setError(`已保存 host.config，但同步 .env.local 失败：${synced.error}`);
        return;
      }
      setHasDataForSeo(synced.hasDataForSeo);
      setHasOpenRouter(synced.hasOpenRouter);
      setDataForSeoInput("");
      setOpenRouterInput("");
      const secretsChanged =
        (dataForSeoTrimmed && dataForSeoTrimmed !== before.dataForSeoApiKey) ||
        (openRouterTrimmed && openRouterTrimmed !== before.openRouterApiKey);
      if (secretsChanged || dataForSeoTrimmed || openRouterTrimmed) {
        notifyOpenSeoRuntimeNeedsRestart("secrets");
      }
      setSuccess("已保存并同步；OpenSEO 正在自动重启，无需关闭 Tab。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dataForSeoInput, openRouterInput]);

  const onClearDataForSeo = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveOpenSeoConfigToHost(host.config, { dataForSeoApiKey: "" });
      setCachedOpenSeoConfig(saved);
      await syncOpenSeoEnvFromHostConfig(host, { clearDataForSeo: true });
      setHasDataForSeo(false);
      setDataForSeoInput("");
      notifyOpenSeoRuntimeNeedsRestart("secrets");
      setSuccess("已清除 DataForSEO Key；OpenSEO 正在自动重启。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View style={styles.column} testID="open-seo-secrets-field">
      <Text style={styles.muted}>密钥保存在本机 host.config；保存时自动写入 .env.local 供 vite 读取。</Text>
      <Text style={styles.muted}>
        DataForSEO API Key {hasDataForSeo ? <Text style={styles.ok}>（已配置）</Text> : null}
      </Text>
      <TextInput
        style={styles.secretInput(dataForSeoFocused)}
        value={dataForSeoInput}
        onChangeText={setDataForSeoInput}
        onFocus={() => setDataForSeoFocused(true)}
        onBlur={() => setDataForSeoFocused(false)}
        placeholder={hasDataForSeo ? "留空则不修改" : "粘贴 DataForSEO API Key"}
        placeholderTextColor={styles.muted.color}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="DataForSEO API Key"
      />
      <Text style={styles.muted}>
        OpenRouter API Key（可选） {hasOpenRouter ? <Text style={styles.ok}>（已配置）</Text> : null}
      </Text>
      <TextInput
        style={styles.secretInput(openRouterFocused)}
        value={openRouterInput}
        onChangeText={setOpenRouterInput}
        onFocus={() => setOpenRouterFocused(true)}
        onBlur={() => setOpenRouterFocused(false)}
        placeholder={hasOpenRouter ? "留空则不修改" : "粘贴 OpenRouter API Key"}
        placeholderTextColor={styles.muted.color}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="OpenRouter API Key"
      />
      <View style={styles.row}>
        <DetailChip
          label="保存并应用"
          tone="accent"
          busy={busy}
          onPress={() => void onSave()}
          testID="open-seo-secrets-save"
        />
        {hasDataForSeo ? (
          <DetailChip
            label="清除 DataForSEO"
            busy={busy}
            onPress={() => void onClearDataForSeo()}
            testID="open-seo-secrets-clear-dataforseo"
          />
        ) : null}
      </View>
      {success ? <Text style={styles.ok}>{success}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function EnvHintSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  return (
    <View style={styles.column} testID="open-seo-env-hint">
      <Text style={styles.muted}>
        首次 dev 前在本仓执行 pnpm install --frozen-lockfile && pnpm run db:migrate:local。保存密钥后自动重启
        OpenSEO，无需关闭 Tab。
      </Text>
    </View>
  );
}

function ReloadTabSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [busy, setBusy] = useState(false);
  const onReload = useCallback(() => {
    setBusy(true);
    notifyOpenSeoRuntimeNeedsRestart("manual");
    window.setTimeout(() => setBusy(false), 1200);
  }, []);
  return (
    <View style={styles.column} testID="open-seo-reload-tab">
      <Text style={styles.muted}>
        子应用胶水热更靠 debug-rev 自动 remount；整窗强刷用菜单 View → Force Reload（⌘⇧R）。此处仅重拉
        OpenSEO sidecar + iframe。
      </Text>
      <View style={styles.row}>
        <DetailChip
          label="重新加载 Tab"
          tone="accent"
          busy={busy}
          onPress={onReload}
          testID="open-seo-reload-tab-button"
        />
      </View>
    </View>
  );
}

function GitUpstreamSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [statusText, setStatusText] = useState("加载中…");
  const [pullMessage, setPullMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const host = getBoundHost();
    if (!host?.tools?.run) {
      setStatusText("需桌面端 host.tools");
      return;
    }
    setError(null);
    try {
      const result = await host.tools.run({
        appId: OPEN_SEO_APP_ID,
        tool: OPEN_SEO_GIT_STATUS_TOOL_REL,
        timeoutMs: 60_000,
      });
      const parsed = parseToolJson(result);
      if (!parsed || parsed.ok === false) {
        setStatusText("无法读取 git 状态");
        setError(typeof parsed?.error === "string" ? parsed.error : "git status 失败");
        return;
      }
      const head = typeof parsed.head === "string" ? parsed.head : "?";
      const branch = typeof parsed.branch === "string" ? parsed.branch : "?";
      setStatusText(`${branch} @ ${head}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusText("读取失败");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const onPull = useCallback(async () => {
    const host = getBoundHost();
    if (!host?.tools?.run) {
      setError("需桌面端 host.tools");
      return;
    }
    setBusy(true);
    setError(null);
    setPullMessage(null);
    try {
      const result = await host.tools.run({
        appId: OPEN_SEO_APP_ID,
        tool: OPEN_SEO_GIT_PULL_TOOL_REL,
        timeoutMs: 180_000,
      });
      const parsed = parseToolJson(result);
      if (!parsed || parsed.ok === false) {
        setError(typeof parsed?.error === "string" ? parsed.error : "git pull 失败");
        return;
      }
      const before = typeof parsed.beforeHead === "string" ? parsed.beforeHead : "?";
      const after = typeof parsed.afterHead === "string" ? parsed.afterHead : "?";
      const changed = parsed.changed === true;
      const summary = typeof parsed.summary === "string" ? parsed.summary : "";
      setPullMessage(
        changed
          ? `已更新 ${before} → ${after}。${summary ? ` ${summary.split("\n")[0]}` : ""}`
          : `已是最新（${after}）。${summary ? ` ${summary.split("\n")[0]}` : ""}`,
      );
      if (changed) {
        setPullMessage(
          (prev) =>
            `${prev ?? ""} dev 模式请确认本仓已 pnpm install；Docker 模式可 docker compose pull。正在重启 OpenSEO…`,
        );
        notifyOpenSeoRuntimeNeedsRestart("git-pull");
      }
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  return (
    <View style={styles.column} testID="open-seo-git-upstream">
      <Text style={styles.mono}>{statusText}</Text>
      <Text style={styles.muted}>仓库根 = 本 Sub App clone 目录；仅 fast-forward pull。</Text>
      <View style={styles.row}>
        <DetailChip label="拉取最新" busy={busy} onPress={() => void onPull()} testID="open-seo-git-pull" />
        <DetailChip label="刷新状态" busy={busy} onPress={() => void refreshStatus()} testID="open-seo-git-refresh" />
      </View>
      {pullMessage ? <Text style={styles.ok}>{pullMessage}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function hasDataForSeoLabel(cfg: OpenSeoAppConfigDocument): string {
  return isOpenSeoSecretConfigured(cfg.dataForSeoApiKey) ? "已配置" : "未配置";
}

export function registerOpenSeoDetailConfig(host: WorkspaceAppHostApi): () => void {
  if (!host.ui?.registerDetailSheetExtras) {
    return () => {};
  }
  void loadOpenSeoConfigFromHost(host.config).then((loaded) => {
    setCachedOpenSeoConfig(loaded);
  });
  return host.ui.registerDetailSheetExtras({
    appId: OPEN_SEO_APP_ID,
    surface: "config",
    buildRows: () => {
      const cfg = getCachedOpenSeoConfig();
      return [
        {
          label: "监听端口",
          value: String(cfg.port),
          helpText: "OpenSEO loopback 端口；默认 3001。",
          groupId: "open-seo-runtime",
          groupTitle: "运行时",
          valueContent: createElement(RuntimeDetailField),
        },
        {
          label: "API 密钥",
          value: hasDataForSeoLabel(cfg),
          helpText: "详情填写；保存后自动同步 .env.local 并重启，无需关 Tab。",
          groupId: "open-seo-runtime",
          groupTitle: "运行时",
          valueContent: createElement(SecretsDetailField),
        },
        {
          label: "环境说明",
          value: "dev 前置",
          helpText: "pnpm install / db migrate 等一次性准备。",
          groupId: "open-seo-runtime",
          groupTitle: "运行时",
          valueContent: createElement(EnvHintSection),
        },
        {
          label: "重新加载",
          value: "Tab / sidecar",
          helpText: "强制重拉 ensure + iframe；整窗强刷用 ⌘⇧R。",
          groupId: "open-seo-runtime",
          groupTitle: "运行时",
          valueContent: createElement(ReloadTabSection),
        },
        {
          label: "上游 Git",
          value: "分支与 commit",
          helpText: "从 GitHub 拉取 open-seo 最新代码（仅 fast-forward）。",
          groupId: "open-seo-upstream",
          groupTitle: "上游同步",
          valueContent: createElement(GitUpstreamSection),
        },
      ];
    },
  });
}
