# Microsoft Rewards Script · 中文版（v5.0.0-ch.1）

[![CI](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/actions/workflows/ci.yml/badge.svg?branch=v5-china)](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zPan2327/Microsoft-Rewards-Script-Ch?label=release&color=blue)](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/releases)
[![Container](https://img.shields.io/badge/ghcr.io-microsoft--rewards--script-2496ED?logo=docker&logoColor=white)](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/pkgs/container/microsoft-rewards-script)
![Node](https://img.shields.io/badge/node-%3E%3D24-green)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

基于 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) **v5.0.0** 的国内本地化版本。
上游 v5 是一次彻底重构（分层架构 + `api` 任务模式 + 重写 Control API），本版在**不改动其架构**的前提下，
把国内用户最需要的三项能力移植进来，并合入了下游排查出的真实缺陷修复。

- 上游基线：`TheNetsky/Microsoft-Rewards-Script` 分支 `v5`，commit `eac1718`，版本 5.0.0（2026-10-31）
- 本版版本：`5.0.0-ch.1`（变更记录见 [CHANGELOG.md](CHANGELOG.md)）
- 许可：GPL-3.0-or-later（与原项目一致，分发修改版需同样开源）

> 与上游的完整差异（逐文件）见 [PATCHES.md](PATCHES.md)；上游同步流程见 [UPSTREAM.md](UPSTREAM.md)。

---

## 这个版本解决了什么

上游 v5 功能最全、维护最活跃，但对国内环境有两处硬伤：**查询词是英文趋势**、**通知只有 Discord/Telegram/ntfy**。
中文版（chiihero）功能齐但停在 v4 架构，且存在几处会导致"积分变少 / 配置存不住"的缺陷。
本版把两者合并到 v5 上：

| 能力                   | 上游 v5              | 本版 | 说明                                              |
| ---------------------- | -------------------- | ---- | ------------------------------------------------- |
| 中国热搜查询源         | ❌                   | ✅   | 百度/头条/抖音/微博/知乎，经 gmya.net 聚合        |
| 中文查询词库           | ❌（`local` 仅英文） | ✅   | `src/data/search-queries.json` 新增 `zh`（83 条） |
| PushPlus 微信推送      | ❌                   | ✅   | 支持 `txt/html/markdown` 模板                     |
| Server酱 微信推送      | ❌                   | ✅   | Turbo 版 `sctapi.ft07.com`                        |
| 中文运行摘要           | ❌                   | ✅   | 每轮/每账户结束额外输出一条中文摘要，可推送       |
| 国内推荐配置           | —                    | ✅   | `config.example.json` 为国内保守档                |
| Docker 构建走国内源    | ❌                   | ✅   | 可选构建参数 `NPM_REGISTRY`                       |
| `rewardsMode: api`     | ✅                   | ✅   | 原样保留，未改动                                  |
| Control API（28 端点） | ✅                   | ✅   | 原样保留                                          |
| 会话库 / 分层架构      | ✅                   | ✅   | 原样保留                                          |

**没有移植**的两项（因为上游 v5 已自行修好，移植会制造冲突）：

- 补丁版（zPan2327）的「配置写入不落盘」：v5 的 `scripts/lib/projectFiles.cjs` 中 `writeJsonAtomic` 已经先做 `fs.realpathSync`，软链接场景天然正确。
- 补丁版的「flyout 兜底永久降级」：v5 已把 `getDashboardData()` 重写为 `userinfo → flyout` 的线性尝试，每次尝试都有独立 deadline，不存在"一次失败污染整轮"的开关。

---

## 快速开始

### 环境要求

- **Node.js 24 或更高**（`package.json` 的 `engines` 会在启动时校验，低于 24 会直接退出）
- Windows / Linux / macOS 均可；Docker 方式最省事

### 方式一：Docker（推荐）

```bash
cp env.example .env          # 填入 ACCOUNT_1_EMAIL / ACCOUNT_1_PASSWORD
cp config.example.json config/config.json

docker compose up -d --build
docker compose logs -f
```

不想自己构建的话，可以直接用已发布的镜像（由 GitHub Actions 在每次发版时构建）：

```bash
docker pull ghcr.io/zpan2327/microsoft-rewards-script:5.0.0-ch.1
```

把 `compose.yaml` 里的 `build:` 段换成镜像即可：

```yaml
services:
    microsoft-rewards-script:
        image: ghcr.io/zpan2327/microsoft-rewards-script:5.0.0-ch.1
        # 其余保持不变
```

国内网络下构建 npm 依赖可能很慢，可指定镜像源：

```bash
NPM_REGISTRY=https://registry.npmmirror.com docker compose up -d --build
```

> `config/`、`sessions/`、`diagnostics/` 都是挂载卷，重建容器不丢数据。
> 若 `patchright install chromium` 阶段卡住，给 Docker 配置代理，或先在宿主机执行一次 `npm run install:browser` 再构建。

### 方式二：Windows 本地运行

```powershell
npm ci
npm run install:browser
npm run build
Copy-Item env.example .env
Copy-Item config.example.json config.json
npm start
```

`config.json` 修改后需重新 `npm run build` 再启动（Docker 下改为 `docker compose up -d --build`）。

### 多账户

在 `.env` 里追加编号块即可，编号可以不连续：

```ini
ACCOUNT_1_EMAIL=first@example.com
ACCOUNT_1_PASSWORD=...
ACCOUNT_1_GEO_LOCALE=CN
ACCOUNT_1_LANG_CODE=zh-CN

ACCOUNT_2_EMAIL=second@example.com
ACCOUNT_2_PASSWORD=...
ACCOUNT_2_GEO_LOCALE=CN
ACCOUNT_2_LANG_CODE=zh-CN
```

每个账户支持独立代理（`ACCOUNT_N_PROXY_*`）、TOTP（`ACCOUNT_N_TOTP_SECRET`）、指纹持久化（`ACCOUNT_N_SAVE_FINGERPRINT_*`）。

---

## 配置重点

完整配置项见上游 [docs/usage.md](docs/usage.md)（英文），国内相关部分如下。

### 1. 查询词来源

```json
"searchSettings": {
    "queryEngines": ["china", "local"],
    "chinaApi": { "appkey": "" }
}
```

- `china`：中国热搜（百度/头条/抖音/微博/知乎）。**免费档有限流**，命中后会返回 403「请求过于频繁」；
  到 <https://gmya.net> 申请 appkey 填入 `chinaApi.appkey`（或环境变量 `CONFIG_CHINA_API_APPKEY`）即可解除。
- `local`：本地中文词库（`src/data/search-queries.json` 的 `zh` 段）。

实现要点（`src/rewards/shared/query/QuerySources.ts`）：

- 源顺序每次随机打散，打散后多样性更好、也更难被单一站点限流；
- 有 appkey：并行取 2 个源；无 appkey：只取 1 个源，并在请求之间插入 1.2–2.5 秒随机退避；
- 命中限流后对后续源做 1.5× 指数退避；
- 首选源全部失败时按顺序尝试备用源，拿到数据即停；
- 全部失败只告警、不抛异常，自动回落到其它查询引擎。

### 2. 微信推送

```json
"webhook": {
    "pushplus": {
        "enabled": true,
        "token": "你的 pushplus token",
        "title": "微软奖励脚本",
        "template": "markdown"
    },
    "serverchan": {
        "enabled": true,
        "sendKey": "SCT...",
        "title": "微软奖励脚本"
    }
}
```

两个渠道可同时开启，也可用环境变量：`CONFIG_PUSHPLUS_ENABLED` / `CONFIG_PUSHPLUS_TOKEN` /
`CONFIG_SERVERCHAN_ENABLED` / `CONFIG_SERVERCHAN_SENDKEY`。

> 默认配置下所有日志级别都会被推送（上游行为）。如果只想收到结果，建议开启 Webhook 过滤：
>
> ```json
> "webhookLogFilter": { "enabled": true, "mode": "whitelist", "keywords": ["摘要", "RUN-END", "ERROR"] }
> ```

### 3. 国内默认值

`config.example.json` 用的是**保守档**：搜索间隔 6–12 分钟、串行搜索、随机滚动与随机点击、超时放 50 秒。
这样单账户一轮会比上游默认（30 秒–1 分钟间隔）慢很多，但风控特征更接近真人。
想跑快就改 `searchSettings.searchDelay` / `readDelay` / `parallelSearching`。

代码内置默认值（`src/config/Defaults.ts`）只改了查询源为 `["china", "local"]`，其余时序保持上游，
便于对照上游文档排查问题。

---

## 中文日志的范围（重要）

上游 v5 的日志分散在 200+ 个源文件里，逐条翻译既不可能长期跟上上游，也会让 `grep` 上游文档失效。
本版采取**关键路径中文化**：

- 每轮结束额外输出 `RUN-END-摘要`：状态、账户数、获得积分、运行前后余额、耗时；
- 每个账户结束额外输出 `ACCOUNT-END-摘要`：状态、积分、余额、用时、任务完成统计、失败原因；
- 中国热搜相关的日志（`SEARCH-CHINA`）为英文结构 + 明确字段，便于定位限流；
- 推送标题默认中文。

其余任务级日志保持英文。如果你需要更彻底的中文化，可以在 `consoleLogFilter` / `webhookLogFilter`
里按需筛选，或直接改 `Logger` 调用点——但请注意这会让后续同步上游产生冲突。

---

## 目录结构（相对上游的变化）

```
src/
  config/                         # + chinaApi、pushplus、serverchan 的类型/默认值/校验/环境变量
  logging/
    PushPlus.ts                   # 新增
    ServerChan.ts                 # 新增
    RunSummaryZh.ts               # 新增：中文摘要文案
    Notifications.ts              # 接入两个新渠道
    Logger.ts                     # 修复 hasWebhook 未包含新渠道的问题
  rewards/shared/query/
    QuerySources.ts               # + getChinaHotTopics()、ChinaApiRateLimitError
    QueryEngine.ts                # + china 处理器
  rewards/shared/data/
    AccountData.ts                # + 旧版 getuserinfo 剔除 _U cookie
  data/search-queries.json        # + zh 词库
config.example.json               # 国内保守档 + 新渠道
env.example                       # 中文注释 + 新环境变量
compose.yaml                      # TZ=Asia/Shanghai、NPM_REGISTRY、国内开关示例
Dockerfile                        # + NPM_REGISTRY 构建参数
```

---

## 验证范围（请务必阅读）

已在真实机器上验证（Linux x86_64，Node **v24.21.0**，Docker **28.5.2** / Compose v2.40.3）：

- ✅ `npm ci` + `npm run build` + `npm run check:api` + `npm run lint` + `npm run format:check` 全部通过
- ✅ `docker build` 成功：Node 24 builder 内编译、`NPM_REGISTRY` 生效、Chromium headless shell（120 MiB）下载并打包
- ✅ `docker compose config` 校验通过（含 `env_file` 长语法与 `NPM_REGISTRY` 构建参数）
- ✅ 容器内 `validateConfig(config.example.json)`：`china` / `chinaApi` / `pushplus` / `serverchan` 均保留，0 条 warning
- ✅ 容器内走真实网络调用 `getChinaHotTopics()`：**50 条热搜、682 ms**
- ✅ 容器内由 entrypoint 生成 `config/config.json`：确认新字段全部落盘（`queryEngines: ["china","local"]`、`chinaApi`、`pushplus`、`serverchan`）
- ✅ Control API `/health` 返回 `{"ok":true,"version":"5.0.0-ch.1",...}`
- ✅ `getChinaHotTopics()` 桩测试：聚合去重、403 后走备用源、全源失败返回空数组且不抛异常

**未做**：真实账号登录与任务执行（需要可用的微软账号）。首次运行请先盯一遍日志。

测试过程中发现并已修正的一个部署风险：上游 compose 使用 `image: microsoft-rewards-script:china` 与
`container_name: microsoft-rewards-script`，如果本机已在跑 V4-china，`docker compose up` 会覆盖它的镜像标签。
本仓库已改为 `microsoft-rewards-script:v5-china` / `microsoft-rewards-script-v5`。

如果你的账号仍在**旧版 Bing Rewards 面板**，本版（与上游 v5 一样）不适用。

---

## 常见问题

**启动即退出，提示 Node 版本不满足？**
`Validator.checkNodeVersion()` 会强制 `engines: >=24`。升级 Node，或在 Docker 内运行。

**热搜一直拿不到？**
先看日志里的 `SEARCH-CHINA`。出现 `rate limited` 就是免费档限流，去申请 appkey；出现超时多半是网络不通，
检查 `proxy.queryEngine` 是否要让查询源走代理。

**微信收不到推送？**
确认 `XX.enabled=true` 且 token/sendKey 非空；`webhookLogFilter` 若开启白名单，关键词必须能匹配到内容。

**改配置后不生效（Docker）？**
`compose.yaml` 里的 `CONFIG_*` 每次启动都会覆盖 `config/config.json`。用面板改配置时，请不要在 compose 里设置同名项。

**能和旧的 V4-china 实例并存吗？**
可以，但**必须改名字**。`compose.yaml` 里已经用 `image: microsoft-rewards-script:v5-china` 和
`container_name: microsoft-rewards-script-v5`，不要改回 `microsoft-rewards-script:china` /
`microsoft-rewards-script`——否则会覆盖你现有实例的镜像标签，或在启动时报容器名冲突。
两套实例的 `config/`、`sessions/` 也必须放在不同目录。

**能直接套用中文版 v4 的 `config.json` 吗？**
不能。v5 有 `rewardsMode`、`taskDelay` 等新键，且 `experimental.apiSearch` / `apiSearchOnBing` 已被上游标记为废弃
（搜索传输方式改由 `rewardsMode` 决定），旧配置会被校验器逐项告警并回退。

---

## 上游与致谢

- 上游：[TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script)（GPL-3.0，作者 Netsky）
- 国内本地化思路与 gmya.net 接口契约参考：[chiihero/Microsoft-Rewards-Script](https://github.com/chiihero/Microsoft-Rewards-Script) `V4-china`
- 旧版接口 `_U` cookie 问题的现象与验证方法参考：[zPan2327/Microsoft-Rewards-Script-Ch](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch) 的 `PATCHES.md`

本项目仅做架构对齐与国内适配，未改变上游的任务执行逻辑。

## 免责声明

使用自动化脚本操作 Microsoft Rewards **可能导致账号被限制或封禁**。本项目仅供学习与自动化技术研究，
作者不对任何账号处罚承担责任。使用前请自行评估风险，并遵守 Microsoft 服务条款。
