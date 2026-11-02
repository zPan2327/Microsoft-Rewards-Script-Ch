# 上游基线与同步方式

## 基线

| 项目         | 值                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------- |
| 上游仓库     | https://github.com/TheNetsky/Microsoft-Rewards-Script                                          |
| 基线分支     | `v5`                                                                                           |
| 基线版本     | 5.0.0                                                                                          |
| 基线 commit  | `eac1718084f4e2cf59e75f699fc2583715f536c2`（提交信息：`v5.0.0 It is what it is.`，2026-10-31） |
| 基线获取方式 | `https://codeload.github.com/TheNetsky/Microsoft-Rewards-Script/tar.gz/refs/heads/v5` 快照     |
| 本仓库版本   | 5.0.0-ch.1                                                                                     |
| 许可证       | GPL-3.0-or-later（继承上游 `LICENSE`，未修改）                                                 |

> 本仓库是从上游 tarball 快照初始化的**独立仓库**，没有保留上游 git 历史。
> 这样做的原因：GitHub 上无法通过 API 复制别人的历史对象，而本地快照无法携带上游 commit 图。
> 代价是 `git log` 看不到上游历史——需要时用下面的 `upstream` remote 直接对照。

## 首次建立对比基线

```bash
git remote add upstream https://github.com/TheNetsky/Microsoft-Rewards-Script.git
git fetch upstream v5
# 只关心差异时（不会改动工作区）
git diff upstream/v5 -- src/ config.example.json compose.yaml
```

> 如果 HTTPS 访问 GitHub 超时，改用 SSH：
> `git remote add upstream git@github.com:TheNetsky/Microsoft-Rewards-Script.git`

## 同步上游新版本的流程

```bash
# 1. 抓取上游
git fetch upstream v5

# 2. 先看清楚上游改了哪些我们改过的文件
git diff --stat upstream/v5 -- \
  src/config/Config.ts src/config/Defaults.ts src/config/Validator.ts \
  src/config/ConfigEnvOverrides.ts src/logging/Logger.ts src/logging/Notifications.ts \
  src/logging/RunSummary.ts src/rewards/shared/query/QuerySources.ts \
  src/rewards/shared/query/QueryEngine.ts src/rewards/shared/data/AccountData.ts \
  Dockerfile compose.yaml config.example.json env.example

# 3. 合并（冲突几乎必然落在上面这些文件）
git merge upstream/v5

# 4. 重新安装依赖并编译
npm ci
npm run build

# 5. 按 PATCHES.md 的"同步后自检"逐项确认
grep -n "china" src/config/Config.ts src/config/Validator.ts src/rewards/shared/query/QueryEngine.ts
grep -n "getChinaHotTopics" src/rewards/shared/query/QuerySources.ts
grep -n "pushplus" src/logging/Logger.ts src/logging/Notifications.ts
grep -n "LEGACY_DASHBOARD_BLOCKED_COOKIES" src/rewards/shared/data/AccountData.ts
```

## 冲突处理原则

1. **上游优先**：架构、类型、流程以上游为准，我们的改动只做"增量挂接"。
2. **不改上游的默认时序**：`Defaults.ts` 只允许把 `queryEngines` 改成 `["china","local"]`，
   其它时序（`searchDelay`、`taskDelay`、`parallelSearching`）保持上游值，国内保守档放在 `config.example.json`。
3. **新增配置必须同时改三处**：`Config.ts`（类型）、`Validator.ts`（zod schema）、`Defaults.ts`（默认值）。
   漏掉 `Validator.ts` 会被 `strictObject` 静默剥离——中文版 v4 的 `webhook.serverchan` 就是这么失效的。
4. **新增通知渠道必须改两处**：`Notifications.ts`（派发）与 `Logger.ts` 的 `hasWebhook` 判断，
   否则代码在但永远不会触发。
