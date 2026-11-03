# Changelog

本项目遵循「上游版本 + 中文本地化序号」的版本号规则，例如 `5.0.0-ch.1` 表示基于上游 `5.0.0` 的第一个中文版。

配套仪表盘：**[zPan2327/rewards-dashboard-i18n](https://github.com/zPan2327/rewards-dashboard-i18n)** —
任务级日志的中文化在仪表盘展示层完成（本仓库保持日志原文，以免破坏解析）。

## [未发布]

## [5.0.0-ch.2] - 2026-11-03

主题：**工程化与可验证性**。不改变运行时行为，补齐测试、CI、发布流水线与配套说明。

### 新增

- **中国热搜源单元测试**（`test/china-source.test.cjs`，7 项）：URL 构造、appkey 裁剪、跨源去重、
  403 限流回落备用源、全源失败、响应结构异常、标题清洗与来源标记。
  `npm test` / `npm run test:china`，CI 在构建后自动执行。
- **CI 流水线**（`.github/workflows/ci.yml`）：lint + 单元测试。
- **GHCR 镜像发布工作流**（`.github/workflows/docker-publish.yml`）：打 tag / 发 Release 即自动构建推送
  `ghcr.io/zpan2327/microsoft-rewards-script-v5`，同时产出带 `v` / 不带 `v` 的版本标签、`latest` 与 `v5-china`。
- **配套仪表盘说明**：README 新增「配套仪表盘」章节，与
  [rewards-dashboard-i18n](https://github.com/zPan2327/rewards-dashboard-i18n) 互相链接。
- **发布说明**：`docs/release-notes-v5.0.0-ch.2.md`。

### 构建

- Chromium 下载源改为可选参数 `ARG PLAYWRIGHT_DOWNLOAD_HOST`（默认走官方 CDN）。
  原先硬编码 npmmirror 会 404：该镜像只同步到 chromium revision 1200，而 patchright 1.64.2 需要 1248。
  国内构建可显式传 `PLAYWRIGHT_DOWNLOAD_HOST`，仅在镜像站已同步对应 revision 时使用。
- 镜像包名改为 `microsoft-rewards-script-v5`：旧包由已删除的旧仓库创建，新仓库的 `GITHUB_TOKEN` 对同名包无写权限。

### 安全

- 所有示例配置（`env.example` / `config.example.json`）均为占位符，仓库内不含任何账号、
  密码、TOTP 密钥、API token 或推送密钥；`.env` 已在 `.gitignore` 中。

> 说明：`v5.0.0-ch.1` 标签在上述部分工程化提交之后才打下，因此这几项构建改动已包含在 `5.0.0-ch.1`
> 镜像里；本次把它们连同单元测试与配套文档一并归档为 `5.0.0-ch.2`。

## [5.0.0-ch.1] - 2026-11-02

首个面向上游 **v5.0.0**（commit `eac1718`，2026-10-31）的中文本地化版本，新建 `v5-china` 分支与既有 `V4-china` 并行维护。

### 新增

- **中国热搜查询源**（`queryEngines` 支持 `china`）：经 gmya.net 聚合百度/头条/抖音/微博/知乎热搜。
    - 源顺序随机打散；有 appkey 时取 2 个源，无 appkey 时取 1 个源并在请求间插入 1.2–2.5 秒随机退避；
    - 命中限流（HTTP 403/429 或 `code=403` 或「请求过于频繁」）后按 1.5× 指数退避；
    - 首选源全部失败时按顺序尝试备用源；全部失败仅告警并回落其它查询引擎，不影响整轮运行。
- **中文查询词库**：`src/data/search-queries.json` 新增 `zh` 段（83 条日常查询词）。
- **PushPlus 推送**（微信）：支持 `txt` / `html` / `markdown` 模板，标题自动附加中文级别。
- **Server酱 Turbo 推送**（微信）：`sctapi.ft07.com`，`sendKey` 直接可用。
- **中文运行摘要**：每轮与每个账户结束额外输出 `RUN-END-摘要` / `ACCOUNT-END-摘要`，控制台与微信推送都能直接读懂结果。
- 配置项与环境变量：`searchSettings.chinaApi.appkey`、`webhook.pushplus.*`、`webhook.serverchan.*`，
  对应 `CONFIG_CHINA_API_APPKEY`、`CONFIG_PUSHPLUS_*`、`CONFIG_SERVERCHAN_*`。

### 修复

- **旧版 `/api/getuserinfo` 被 `_U` cookie 打成 302**：该接口带 `_U` 时会跳登录页，导致 dashboard 降级到
  Bing flyout（`punchCards` / `morePromotionsWithoutPromotionalItems` 为空），打卡与促销任务被整段跳过、实际少拿积分。
  现仅对这一个请求剔除 `_u`，其它 Bing 请求的 cookie 不做改动。
- **`Logger.hasWebhook` 漏判新渠道**：原先只检查 discord/ntfy/telegram，即使配置了 PushPlus / Server酱 也不会发送通知。

### 部署

- `config.example.json` 调整为国内保守档：`queryEngines: ["china","local"]`、搜索间隔 6–12 分钟、
  阅读间隔 6–11 分钟、串行搜索、随机滚动/点击、`globalTimeout: 50sec`、`searchResultVisitTime: 20sec`。
- `compose.yaml`：`TZ=Asia/Shanghai`、镜像名 `microsoft-rewards-script:v5-china`、
  容器名 `microsoft-rewards-script-v5`（避免与本机已运行的 V4-china 实例冲突）、构建参数 `NPM_REGISTRY`。
- `Dockerfile`：新增 `ARG NPM_REGISTRY`，国内构建可走 `https://registry.npmmirror.com`。
- `env.example` 全量中文注释，账户示例固定 `GEO_LOCALE=CN` / `LANG_CODE=zh-CN`。

### 未移植（上游 v5 已自行修复，移植只会制造冲突）

- 配置写入穿透软链接：v5 的 `scripts/lib/projectFiles.cjs::writeJsonAtomic` 已先执行 `fs.realpathSync`。
- flyout 兜底永久降级：v5 已把 `getDashboardData()` 重写为 `userinfo → flyout` 的线性尝试，每次尝试独立 deadline。

### 暂不支持

- 微信 ClawBot（腾讯 iLink 灰度接口）推送：依赖未公开接口与扫码凭证，稳定性无法保证。
- `humanize` 拟人化策略（静默时段 / 目标完成度随机）：与 v5 的 `TaskPacing`、`SearchProgress` 耦合，需单独评估。

### 验证

Linux x86_64 + Node 24.21.0 + Docker 28.5.2 实机验证：`npm ci` / `build` / `check:api` / `lint` / `format:check` 全通过；
`docker build` 成功；`docker compose config` 通过；容器内 50 条热搜 682 ms；
entrypoint 生成的 `config/config.json` 含全部新字段；Control API `/health` 返回 `5.0.0-ch.1`。
**未验证**：真实账号登录与任务执行。
