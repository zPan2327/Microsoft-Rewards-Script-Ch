# Changelog

本项目遵循「上游版本 + 中文本地化序号」的版本号规则，例如 `5.0.0-ch.1` 表示基于上游 `5.0.0` 的第一个中文版。

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
