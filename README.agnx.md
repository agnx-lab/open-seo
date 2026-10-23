# Agnx Sub App 胶水（本目录）

官方 [open-seo](https://github.com/every-app/open-seo) 的 Agnx 外置子应用薄壳。

## 构建胶水

```bash
node agnx/scripts/build.mjs
```

## 上游自托管（首次）

```bash
cp .env.example .env
# 填写 DATAFORSEO_API_KEY；建议 AUTH_MODE=local_noauth、OPENSEO_TELEMETRY_DISABLED=1
docker compose up -d
```

## Tab 行为

打开 Tab → `ensure-open-seo.mjs` 默认拉起 **vite dev** → iframe `http://127.0.0.1:3001`

（Docker 仅在详情配置显式选 runtimeMode=docker 时使用。）

活页：Agnx monorepo `docs/sub-app/OpenSEO子应用需求_open-seo-sub-app.md`
