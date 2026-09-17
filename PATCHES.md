# 本仓库的本地补丁（PATCHES）

本仓库 fork 自 [chiihero/Microsoft-Rewards-Script](https://github.com/chiihero/Microsoft-Rewards-Script) 的 `V4-china` 分支，
在上游基础上追加了少量修复。从上游拉取新版本、或重新构建镜像之后，请对照本文件确认补丁是否还在。

> fork 地址：`git@github.com:zPan2327/Microsoft-Rewards-Script-Ch.git`（分支 `V4-china`），
> 本地 `V4-china` 已把上游分支指向 `fork/V4-china`，日常 `git pull` / `git push` 都是对 fork 操作。

> 补丁全部改在 `src/` 源码里，所以只要源码没被上游覆盖，重新执行 `docker compose up -d --build` 依然带着修复。
> `dist/` 在 `.gitignore` 中，属于构建产物，不需要提交。

---

## 目录

- [补丁 1：修复旧版接口被 `_U` cookie 打成 302，导致仪表板数据降级](#补丁-1修复旧版接口被-_u-cookie-打成-302导致仪表板数据降级)
- [补丁 2：Control API 写 config.json 时跟随软链接](#补丁-2control-api-写-configjson-时跟随软链接)
- [补丁 3：ConfigSchema 补上 webhook.serverchan](#补丁-3configschema-补上-webhookserverchan)
- [补丁清单速查](#补丁清单速查)
- [从上游同步后怎么处理](#从上游同步后怎么处理)
- [本机部署提示](#本机部署提示)
- [验证补丁确实生效](#验证补丁确实生效)
- [合并上游后 dist 会落后于 src](#合并上游后-dist-会落后于-src)

---

## 补丁 1：修复旧版接口被 `_U` cookie 打成 302，导致仪表板数据降级

- **提交**：`3c4f7fc`
- **文件**：`src/browser/BrowserFunc.ts`
- **影响**：所有账户的打卡（Punch Cards）与促销任务，直接关系到积分收入

### 现象

日志里会出现这一串：

```
[GET-DASHBOARD-DATA] 主接口请求失败，正在重试一次 | 信息=Dashboard data missing from API response
[GET-DASHBOARD-DATA] 重试后主接口仍不可用，改用 Bing flyout 兜底 | 信息=Dashboard data missing from API response
[GET-DASHBOARD-DATA] 使用 Bing flyout 部分仪表板 | 疑似受限=false | bot标记=false | 活动折叠=false
```

出现之后，**这一轮里剩下的所有账户**都不再执行打卡类任务，积分明显变少。

### 根因

`getDashboardData()` 走的是 `URLs.rewards.userInfoApi`，也就是
`https://rewards.bing.com/api/getuserinfo`。这个接口在 `src/constants/urls.ts` 里自己就标了 `// Legacy, avoid!`，
是 rewards 的旧版接口。

当请求的 Cookie 里带上 `.bing.com` 域下的 `_U` 时，这个接口会 **302 跳转到登录页**：

```
GET https://rewards.bing.com/api/getuserinfo
302 -> https://rewards.bing.com/Signin
    -> https://login.windows.net/consumers/oauth2/v2.0/authorize
```

响应体因此变成登录页 HTML，`response.data?.dashboard` 为空，
代码抛出 `Dashboard data missing from API response`。

**关键点：这不是账号或会话的问题。** 同一个 Cookie 集合去请求 `/earn` 是正常的
（200，353 KB，`lang="zh-Hans"`），说明会话本身是健康的，只有这个旧版接口被 `_U` 搞坏。

更糟的是后面这个逻辑：

```ts
private useFlyoutDashboardFallback = false
// ...
this.useFlyoutDashboardFallback = true      // 一次失败就永久置真
```

`BrowserFunc` 实例是跟着 worker 进程走的，所以**一个 worker 里只要有一个账户踩过一次，
之后这个进程处理的所有账户都会被钉死在 flyout 兜底分支上**，一次瞬时故障会污染整轮。

而 flyout 兜底拿到的数据是残缺的 —— `src/browser/FlyoutDashboard.ts` 里这几个字段是硬编码的空值：

```ts
morePromotionsWithoutPromotionalItems: [],
punchCards: [],
```

这些字段会真实影响业务逻辑：

| 消费方 | 使用的字段 |
| --- | --- |
| `src/functions/activities/rewards/PunchCards.ts` | `dashboard.punchCards` |
| `src/functions/activities/rewards/MorePromotions.ts` | `morePromotions`、`morePromotionsWithoutPromotionalItems` |
| `src/functions/activities/search/BonusTracker.ts` | 同上 |

字段为空 → 这些任务被整体跳过 → **真实少拿积分**。

> 顺带一提：`lifetimePoints` 同样是兜底里的降级字段，但它只用于展示，不参与任何任务决策。

### 实测数据

在真实容器里用真实会话 Cookie 跑 `getDashboardData()`，4 个账号 × 桌面/移动共 8 组：

| | 结果 |
| --- | --- |
| 修复前 | 8/8 全部失败，错误 `HTTP 302` |
| 修复后 | 8/8 全部成功，`warned=0` |

只对比 Cookie 差异（同样 8 组）：

```
带 _U     -> 全部 302，无 dashboard
去掉 _U   -> 全部 200，dashboard 完整，punchCards=4
```

再单独二分，锁定到就是 `_U` 一个 cookie：

```
auth + _U       -> 302  hasDashboard=false
auth + _MsaRef  -> 200  hasDashboard=true
```

修复后的真实返回：

```
account1@example.com [desktop] punchCards=4 morePromotions=4 mwp=4 lifetime=60501
account1@example.com [mobile]  punchCards=4 morePromotions=4 mwp=4 lifetime=60501
account2@example.com [desktop] punchCards=4 morePromotions=8 mwp=4 lifetime=2046
account2@example.com [mobile]  punchCards=4 morePromotions=8 mwp=4 lifetime=2046
account3@example.com [desktop] punchCards=4 morePromotions=7 mwp=4 lifetime=2755
account3@example.com [mobile]  punchCards=4 morePromotions=7 mwp=4 lifetime=2755
account4@example.com [desktop] punchCards=4 morePromotions=9 mwp=5 lifetime=2018
account4@example.com [mobile]  punchCards=4 morePromotions=9 mwp=5 lifetime=2018
```

### 改动内容

共两处，都在 `src/browser/BrowserFunc.ts`。

**1）只在这个旧版接口上剔除 `_U`**

```ts
const LEGACY_DASHBOARD_BLOCKED_COOKIES = new Set(['_u'])

function withoutLegacyBlockedCookies(cookies: Cookie[]): Cookie[] {
    return cookies.filter(cookie => !LEGACY_DASHBOARD_BLOCKED_COOKIES.has(cookie.name.toLowerCase()))
}
```

调用点：

```ts
Cookie: this.buildCookieHeader(
    withoutLegacyBlockedCookies(this.getCachedCookies(cookies, URLs.rewards.userInfoApi))
),
```

改动范围刻意收窄到这一个请求：`_U` 对其它 bing 请求是无害的（`/earn` 带与不带都是 200），
所以不对全局 Cookie 做任何裁剪，不影响搜索等其它流程。

**2）把一次性的永久降级改成 60 秒冷却窗口**

```ts
const FLYOUT_FALLBACK_COOLDOWN_MS = 60_000

private flyoutDashboardFallbackUntil = 0

if (Date.now() >= this.flyoutDashboardFallbackUntil) {
    // ... 走主接口
    this.flyoutDashboardFallbackUntil = Date.now() + FLYOUT_FALLBACK_COOLDOWN_MS
}
```

这样瞬时故障只会让主接口冷却一分钟，之后自动重试，不会再出现「一次失败拖垮整轮」的情况。

### 如果上游以后改了这里

`getDashboardData()` 被上游重写时，需要重新把这两点加回去：

1. 请求 `URLs.rewards.userInfoApi` 时不要带 `_U`；
2. 兜底开关不要用「永久置真」，至少给它一个冷却窗口或重试机会。

---

## 补丁 2：Control API 写 config.json 时跟随软链接

- **文件**：`scripts/api/configEditor.js`（函数 `writeConfigAtomic`）
- **影响**：仪表盘「配置」页保存配置。不修的话，保存的配置永远不生效。

### 现象

在仪表盘点保存，界面提示成功（`PUT` / `PATCH /config` 返回 `ok:true`），但：

1. 机器人重启后改动全部消失；
2. 宿主机 `./config/config.json` 的 inode 与 mtime 从头到尾没变过。

### 根因

Docker 官方 entrypoint 为了让应用能在项目根读到配置，建了一个软链接：

    # scripts/docker/entrypoint.sh 第 78 行
    ln -sf "$CONFIG_FILE" "$SCRIPT_DIR/config.json"
    # 即 <root>/config.json -> <root>/config/config.json

而 `writeConfigAtomic()` 用的是「写临时文件 + rename」的原子写法：

    const tmp = target + "." + process.pid + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2))
    fs.renameSync(tmp, target)   # <-- 问题在这里

`renameSync` 替换的是目录项本身，并不会写穿软链接。于是：

- 第一次保存：根目录的 `config.json` 软链接**被替换成普通文件**，写进容器可写层；
- bind mount 里的 `config/config.json` 完全没被碰过；
- 容器一重启，entrypoint 重跑 `ln -sf` 重建软链接，于是又指回那份从未被修改过的挂载文件，刚保存的内容全部消失。

而且根目录已经是普通文件了，后续保存也一直只改容器内那一份，形成「假保存」。

### 改动内容

写入前先把目标解析成软链接的真实路径：

    export function writeConfigAtomic(projectRoot, cfg) {
        let target = resolveConfigPath(projectRoot)
        try {
            target = fs.realpathSync(target)
        } catch {
            // target does not exist yet - keep the resolved candidate path
        }
        ...
    }

`realpathSync` 对普通文件是幂等的（返回自身），不影响非软链接场景。

### 验证

    F=/vol1/1000/A-docker/Microsoft-Rewards-Script/config/config.json
    stat -c "%i %s" "$F"
    curl -s -X PATCH -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d @/tmp/patch.json \
      http://127.0.0.1:3011/config
    stat -c "%i %s" "$F"

返回的 `path` 应为 `config/config.json`（修复前是项目根的 `config.json`），且第二条 `stat` 的 inode 必须发生变化。


---

## 补丁 3：ConfigSchema 补上 webhook.serverchan

- **文件**：`src/util/Validator.ts`（`WebhookSchema`）
- **影响**：`webhook.serverchan` 整段配置，以及 `CONFIG_SERVERCHAN_*` 三个环境变量

### 现象

写在 `config.json` 里的 `webhook.serverchan` 段，经过 `loadConfig()` 之后被静默丢弃；
`CONFIG_SERVERCHAN_ENABLED` / `CONFIG_SERVERCHAN_SENDKEY` / `CONFIG_SERVERCHAN_TITLE` 形同虚设。

拿真实 `config.json` 过一遍 schema 实测：

    STRIPPED_KEYS: ["webhook.serverchan"]

3344 字节的配置文件校验后变成 3229 字节，差值恰好是 serverchan 那一整段。

### 根因

`ConfigSchema` 与 `WebhookSchema` 都是普通 `z.object`，默认会剥离未声明字段。
`WebhookSchema` 里声明了 `discord`、`ntfy`、`telegram`、`pushplus`、`clawbot`、`webhookLogFilter`，
唯独漏了 `serverchan`，于是它被当成未知字段剥掉。

这是一类会反复踩的坑：提交 `027543e` 修的 `humanize` 被剥离，是同一个成因
（那次是顶层漏了 `humanize`）。**往 config 里加新配置段时，必须同步在 schema 里声明。**

### 改动内容

    serverchan: z
        .object({
            enabled: z.boolean().optional(),
            sendKey: z.string(),
            title: z.string().optional()
        })
        .optional(),

字段与 `src/interface/Config.ts` 里的 `WebhookServerChanConfig` 保持一致，
位置上放在 `pushplus` 与 `clawbot` 之间，与 interface 及 `config.example.json` 的顺序对齐。

### 验证

修复后，下面这条命令应输出 1（修复前是 0）：

    docker exec microsoft-rewards-script \
      grep -c serverchan /usr/src/microsoft-rewards-script/config/config.json

也可以直接跑一遍 schema 比对，`STRIPPED_KEYS` 应为空数组。

---

## 补丁清单速查

| # | 文件 | 提交 | 一句话 |
| --- | --- | --- | --- |
| 1 | `src/browser/BrowserFunc.ts` | `3c4f7fc` | 旧版 `getuserinfo` 接口剔除 `_U` cookie；flyout 兜底改为 60s 冷却而非永久降级 |
| 2 | `scripts/api/configEditor.js` | - | 写 config.json 前先 realpathSync，跟随 entrypoint 建的软链接 |
| 3 | `src/util/Validator.ts` | - | WebhookSchema 补上 serverchan，修复该配置段被 Zod 静默剥离 |

---

## 从上游同步后怎么处理

```bash
# 1) 先拉本仓库的 fork（本地 V4-china 已跟踪 fork/V4-china）
git pull

# 2) 再合并上游新提交。本机访问 github 的 https 会超时，必须走 SSH：
git remote add upstream git@github.com:chiihero/Microsoft-Rewards-Script.git
git fetch upstream
git merge upstream/V4-china

# 3) 确认补丁还在
grep -n withoutLegacyBlockedCookies src/browser/BrowserFunc.ts
grep -n flyoutDashboardFallbackUntil src/browser/BrowserFunc.ts
grep -n realpathSync scripts/api/configEditor.js
grep -n "serverchan: z" src/util/Validator.ts

# 4) 重新编译并重启
npm run build
docker compose up -d --build

# 5) 推回 fork，让它保持「上游最新 + 补丁」
git push
```

如果 `grep` 没有输出，说明上游把这块重写了，按上面「如果上游以后改了这里」重新应用一次。

---

## 本机部署提示

本机还有一个 **未提交**（已被 `.gitignore` 忽略）的 `compose.override.yaml`，用来在不重建镜像的前提下做验证：

- 挂载 `./dist/browser/BrowserFunc.js`（补丁 1 的编译产物）；
- 挂载 `./patches/configEditor.js` 与 `./patches/Validator.js`（补丁 2、3 的编译产物）。

**不要提交这个文件。** 它把宿主机的 `./dist/browser/BrowserFunc.js` 绑定挂载进容器；
全新克隆的仓库没有 `dist/` 目录，Docker 会在挂载点新建一个同名目录，
容器里这个文件就变成了目录，bot 会直接启动失败。同理，`patches/` 也不该提交
（它是从 `dist/` 复制并改出来的构建产物，本身已被忽略）。

正常流程 `docker compose up -d --build` 会从 `src/` 与 `scripts/` 重新编译，
本来就包含全部三个补丁，**不需要**这个 override。

确认容器里跑的是带补丁的版本：

```bash
docker exec microsoft-rewards-script md5sum /usr/src/microsoft-rewards-script/dist/browser/BrowserFunc.js
```

如果输出是下面这个值，说明编译产物和本仓库源码一致：

```
265038b32c1d01671fcbb307f22c6d56  dist/browser/BrowserFunc.js
```

---

## 验证补丁确实生效

打补丁后的第一次全新运行，日志里不应该再出现这两行：

```
主接口请求失败，正在重试一次 | 信息=Dashboard data missing from API response
重试后主接口仍不可用，改用 Bing flyout 兜底
```

也不应该再出现：

```
使用 Bing flyout 部分仪表板
```

后者一旦出现，说明这次运行仍然走了兜底分支，`punchCards` / `morePromotions` 会是空的，任务会被整段跳过。

---

## 合并上游后 dist 会落后于 src

执行 `git merge upstream/V4-china` 之后，`src/` 里已经有上游的新修复，但 `dist/` 还是上一次编译出来的产物。
容器只挂载了 `dist/browser/BrowserFunc.js` 这一个文件，所以上游的其它改动不会自动生效。

要么等下一次 `docker compose up -d --build`（会重新编译，顺带带上上游修复），要么现在就重建。
**不要在运行中重建**：正在跑的 bot 进程还有懒加载的模块，重写 `dist/` 可能让它读到半个文件。
