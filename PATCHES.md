# 相对上游 v5.0.0 的全部改动

基线：`TheNetsky/Microsoft-Rewards-Script` @ `v5` / 5.0.0 / `eac1718`。
本文件是"改了什么、为什么这样改、同步上游后怎么确认还在"的唯一清单。

---

## 1. 新增：中国热搜查询源

**文件**：`src/rewards/shared/query/QuerySources.ts`、`src/rewards/shared/query/QueryEngine.ts`、`src/config/Config.ts`

- `QueryEngine` 联合类型增加 `'china'`；`QueryEngine.ts` 的 `sourceHandlers` 增加对应处理器
  （该表是 `Record<QueryEngineName, …>`，少一个键就编译失败，所以不会漏）。
- `QuerySources.getChinaHotTopics(language, country)`：调用 gmya.net 热门词接口，
  源为 `BaiduHot` / `TouTiaoHot` / `DouYinHot` / `WeiBoHot` / `ZhiHuHot`。
- 接口契约（已实测）：`GET https://api.gmya.net/Api/BaiduHot` →
  `{ code: 200, msg: "请求成功", data: [{ title, hot, url, updatetime }], info }`。
  带 appkey 时 URL 为 `?format=json&appkey=...`，不带 appkey 时无查询串（与中文版 v4 一致）。
- 限流识别：HTTP 403/429、或 `code` 为 `403`/`429`、或 `msg` 含「请求过于频繁」/「appkey」。
  命中后抛 `ChinaApiRateLimitError`，上层据此把退避倍数 ×1.5。
- 调度策略：
    - 源顺序随机打散；
    - 有 appkey：取 2 个源，请求间不等待；
    - 无 appkey：只取 1 个源，请求间 1.2–2.5 秒随机退避；
    - 首选源全失败 → 按顺序试备用源，拿到数据即停；
    - 全部失败 → 仅告警并返回 `[]`，由其它引擎兜底。
- 标题经 `cleanQuery(title, true)` 清洗，按标题去重，`kind: 'trend'`，`source: china.<SourceName>`。

**同步后自检**：`grep -n "getChinaHotTopics" src/rewards/shared/query/QuerySources.ts`

---

## 2. 新增：中文查询词库

**文件**：`src/data/search-queries.json`

上游文件本身就是 `{ "en": [...] }` 结构，`getLocalQueryList()` 支持按语言取段。
本版新增 `zh` 段（83 条日常向查询词），因此 `"queryEngines": ["local"]` 在 `lang=zh` 时能取到中文词。

**同步后自检**：`node -e "console.log(Object.keys(require('./src/data/search-queries.json')))"`

---

## 3. 新增：PushPlus / Server酱 推送

**文件**：`src/logging/PushPlus.ts`（新）、`src/logging/ServerChan.ts`（新）、
`src/logging/Notifications.ts`、`src/logging/Logger.ts`、`src/config/{Config,Defaults,Validator,ConfigEnvOverrides}.ts`

- 两个渠道都复用上游的 `createNotificationQueue` / `enqueueNotification` / `flushQueue`，
  自动获得：并发 1、每秒 2 条限速、429 重试、队列满丢弃告警、摘要优先（`RUN-END`/`ACCOUNT-END` 优先级 10）。
- PushPlus：`POST https://www.pushplus.plus/send`，`{ token, title, content, template, channel? }`，
  标题为 `<标题> · <级别中文>`，`template` 支持 `txt/html/markdown`（默认 markdown）。
- Server酱 Turbo：`POST https://sctapi.ft07.com/<sendKey>.send`，`{ title, desp, tags }`，
  `tags` 按级别映射为「错误 / 警告」。
- 内容超长会截断（PushPlus 18000 字符、Server酱 30000 字符），避免请求体被服务端拒绝。

**必须注意的两个接入点**（上游扩展渠道的两个坑）：

1. `Logger.hasWebhook` 只判断了 discord/ntfy/telegram —— 不改它，新渠道**永远不会被触发**。已补上 pushplus/serverchan。
2. `Notifications.flushNotifications` 需要把新队列一起 flush，否则进程退出时最后几条会丢。

**同步后自检**：

```bash
grep -n "pushplus" src/logging/Logger.ts
grep -n "flushPushPlusQueue" src/logging/Notifications.ts
```

---

## 4. 新增：中文运行摘要

**文件**：`src/logging/RunSummaryZh.ts`（新）、`src/logging/RunSummary.ts`

- `RUN-END-摘要`：`本轮结束 | 状态=完成 | 账户=1/1 | 获得积分=42 | 运行前余额=1200 | 当前余额=1242 | 耗时=35.2分钟`
- `ACCOUNT-END-摘要`：`账户结束 | 账户=… | 状态=… | 获得积分=… | 余额=… | 用时=…秒 | 任务: 已完成… 未完成… 不可用… 不适用… | 原因=…`
- 通过 `logger.info()` 输出（**不是** `logger.event()`），因此不会向 Control API 注入新的领域事件，
  也不会打乱 `control-api/logs/apply.js` 对 `RUN-END` / `ACCOUNT-END` 的解析。
- `logRunResult` 的参数类型从 `Pick<Logger,'event'>` 放宽为 `Pick<Logger,'event'|'info'>`。

**不上更重的中文化的原因**：上游日志分散在 200+ 文件，逐条翻译无法长期跟随上游；关键路径摘要已覆盖
"跑完了吗、拿了多少分、为什么失败"三个实际诉求。

**同步后自检**：`grep -n "RUN-END-摘要" src/logging/RunSummary.ts`

---

## 5. 修复：旧版 `getuserinfo` 被 `_U` cookie 打成 302

**文件**：`src/rewards/shared/data/AccountData.ts`
**来源**：早期 v4 分支上的实测定位（8/8 会话复现、二分到单个 `_U` cookie）

- 现象：日志出现 `User data source unavailable | via=node-http | path=/api/getuserinfo`，随后走 flyout 兜底，
  而 flyout 映射出的 `punchCards` / `morePromotionsWithoutPromotionalItems` 为空 → 打卡与促销任务被整段跳过。
- 根因：`rewards.bing.com/api/getuserinfo`（源码注释自标 `// Legacy, avoid!`）在 Cookie 带 `_U` 时 302 跳登录页，
  响应体变 HTML，JSON 解析失败。同一 Cookie 请求 `/earn` 正常，说明会话本身健康。
- 改动：仅对 `URLs.rewards.userInfoApi` 这一个请求过滤 `_u`：
    ```ts
    const LEGACY_DASHBOARD_BLOCKED_COOKIES = new Set(['_u'])
    function withoutLegacyBlockedCookies(cookies, url) {
        if (url !== URLs.rewards.userInfoApi) return cookies
        return cookies.filter(c => !LEGACY_DASHBOARD_BLOCKED_COOKIES.has(c.name.toLowerCase()))
    }
    ```
    其余 Bing 请求（搜索、`/earn` 页面等）的 Cookie 不做任何裁剪。

**与补丁版的差异**：补丁版还把"永久降级开关"改成 60 秒冷却；v5 已经没有这个开关
（`getDashboardData()` 是 `userinfo → flyout` 的线性尝试，每次带独立 deadline），因此这部分无需移植。

**同步后自检**：`grep -n "LEGACY_DASHBOARD_BLOCKED_COOKIES" src/rewards/shared/data/AccountData.ts`

---

## 6. 配置：新增字段与环境变量

**类型/默认值/校验三处同步修改**（这是本仓库最容易漏的地方）：

| 配置路径                                                  | 类型           | 默认值 | 校验                                         | 环境变量                  |
| --------------------------------------------------------- | -------------- | ------ | -------------------------------------------- | ------------------------- |
| `searchSettings.chinaApi.appkey`                          | `string?`      | `''`   | `strictObject({appkey?: string}).optional()` | `CONFIG_CHINA_API_APPKEY` |
| `webhook.pushplus.{enabled,token,title,template,channel}` | 见 `Config.ts` | 关闭   | `strictObject`                               | `CONFIG_PUSHPLUS_*`       |
| `webhook.serverchan.{enabled,sendKey,title}`              | 见 `Config.ts` | 关闭   | `strictObject`                               | `CONFIG_SERVERCHAN_*`     |

> `WebhookSchema` 与 `searchSettings` 都是 `z.strictObject`：**只加类型不加 schema，会被静默剥离**。
> 中文版 v4 的 `webhook.serverchan` 正是这样失效的（配置写进去、运行时被删掉、日志毫无提示）。

默认值改动只有一处：`searchSettings.queryEngines` 由 `['google','local','wikipedia','rss.googleNews']`
改为 `['china','local']`，其余时序默认值保持上游，便于对照上游文档。

---

## 7. 部署：国内可用性

| 文件                  | 改动                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.example.json` | 国内保守档：`queryEngines: ["china","local"]`、搜索间隔 6–12 分钟、阅读间隔 6–11 分钟、串行搜索、随机滚动/点击、`globalTimeout: 50sec`、`searchResultVisitTime: 20sec`、`doVisualSearch: false`、`proxy.queryEngine: false`；新增 pushplus/serverchan 段 |
| `env.example`         | 中文注释；账户示例固定 `GEO_LOCALE=CN` / `LANG_CODE=zh-CN`；新增 `CONFIG_CHINA_API_APPKEY`、`CONFIG_PUSHPLUS_*`、`CONFIG_SERVERCHAN_*` 说明                                                                                                              |
| `compose.yaml`        | `TZ: Asia/Shanghai`、镜像名 `microsoft-rewards-script:v5-china`、容器名 `microsoft-rewards-script-v5`（避免与 V4-china 实例冲突）、构建参数 `NPM_REGISTRY`、国内相关开关的注释示例                                                                       |
| `Dockerfile`          | 新增 `ARG NPM_REGISTRY`，非空时 `npm config set registry`（在 builder 阶段两次 `npm ci` 之前生效）                                                                                                                                                       |
| `package.json`        | `version: 5.0.0-ch.1`、描述与 keywords 增加 china/zh-CN/wechat/pushplus/serverchan                                                                                                                                                                       |

---

## 8. 明确**未**移植的上游历史问题

| 补丁版的补丁                                     | 为什么没移植                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 补丁 2：`writeConfigAtomic` 写入穿透软链接       | 上游 v5 的 `scripts/lib/projectFiles.cjs::writeJsonAtomic` 已先执行 `fs.realpathSync(requested)`，行为正确 |
| 补丁 1 的"永久降级开关"                          | 上游 v5 已重写 `getDashboardData()`，不存在该开关                                                          |
| 补丁 3：`WebhookSchema` 漏 `serverchan`          | 本版是从零新增 `serverchan`，schema 一开始就声明了，不存在剥离问题                                         |
| 中文版 v4 的 ClawBot（微信 iLink）推送           | 依赖未公开接口 + 扫码登录凭证文件，稳定性无法保证；本次范围不含                                            |
| 中文版 v4 的 `humanize`（静默时段/目标比例随机） | 与 v5 的 `TaskPacing` / `SearchProgress` 逻辑耦合，改动面大；建议作为独立 PR 评估                          |

---

## 9. 已做的验证

本机（Windows / Node 22）与真实 Linux 服务器（Node **v24.21.0**、Docker **28.5.2**、Compose v2.40.3）双端验证：

```bash
npm ci --ignore-scripts        # Node 22 与 24 均通过；运行仍需 Node ≥ 24
npm run build                  # tsc 全量类型检查
npm run check:api              # control-api 单独 tsconfig
npm run lint                   # eslint
npm run format:check           # prettier
docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t <tag> .
docker compose config -q
```

- 配置层：`validateConfig(config.example.json)` → 新字段保留、0 warning；缺省 `chinaApi` 被补齐；
  `appkey` 不被剥离；非法引擎 `["china","nope"]` 回退为 `["china","local"]`。
- 运行时：容器内由 entrypoint 生成的 `config/config.json` 中，`queryEngines` 为 `["china","local"]`，
  `chinaApi` / `pushplus` / `serverchan` 三段完整存在（说明 `Defaults.ts` 与 `Validator.ts` 一致，没有被剥离）。
- 网络：容器内 `getChinaHotTopics()` 实跑 **50 条 / 682 ms**；`api.gmya.net/Api/BaiduHot` 返回 `code:200` + 51 条 `data[].title`。
- Control API：`/health` 返回 `{"ok":true,"name":"microsoft-rewards-script","version":"5.0.0-ch.1","state":"idle"}`。
- 构建：Chrome Headless Shell 156.0.8078.4（playwright chromium-headless-shell v1248）随镜像打包成功。
- **未做**：真实账号登录与任务执行。

### 测试中发现并修正的问题

上游 `compose.yaml` 使用 `image: microsoft-rewards-script:china` 与 `container_name: microsoft-rewards-script`。
如果宿主机已在运行 V4-china 实例，直接 `docker compose up` 会覆盖其镜像标签、并在容器名上冲突。
本仓库已改为 `image: microsoft-rewards-script:v5-china` / `container_name: microsoft-rewards-script-v5`。
