# v5.0.0-ch.2 发布说明

> **Microsoft Rewards Script · 中文版** —— 基于上游 [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) `v5.0.0` 的中文本地化版本。
>
> 本版本与 **[zPan2327/rewards-dashboard-i18n](https://github.com/zPan2327/rewards-dashboard-i18n)**（配套仪表盘）**配套使用**。

|          |                                                                                     |
| -------- | ----------------------------------------------------------------------------------- |
| 版本     | `5.0.0-ch.2`                                                                        |
| 发布日期 | 2026-11-03                                                                          |
| 上游基线 | `TheNetsky/Microsoft-Rewards-Script` 分支 `v5`（`5.0.0`）                           |
| 分支     | [`v5-china`](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/tree/v5-china) |
| 许可证   | GPL-3.0-or-later                                                                    |
| 镜像     | `ghcr.io/zpan2327/microsoft-rewards-script-v5:5.0.0-ch.2`                           |

---

## 两个仓库，一套方案

这个版本的主题是「**脚本保持英文原文，中文化放到展示层**」。原因很实际：

- 上游 v5 的日志分散在 200+ 个源文件里，逐条翻译既跟不动上游，也会让 `grep` 上游文档失效；
- 仪表盘的 `lib/parser.js` 用 17 处英文正则解析日志，**改写正文会让活动明细 / 积分 / 连续天数三张表变空**。

因此分工如下：

| 仓库                                      | 职责                                                         | 链接                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Microsoft-Rewards-Script-Ch**（本仓库） | 中国热搜源、微信推送、中文运行摘要；**日志正文保持英文原文** | [github.com/zPan2327/Microsoft-Rewards-Script-Ch](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch) |
| **rewards-dashboard-i18n**（配套仪表盘）  | 界面与**日志正文/标题的中文化**（展示层字典，不改数据）      | [github.com/zPan2327/rewards-dashboard-i18n](https://github.com/zPan2327/rewards-dashboard-i18n)           |

> 想要日志显示中文？装配套仪表盘即可，脚本侧无需任何改动。
> 详见仪表盘侧的 [日志中文化说明](https://github.com/zPan2327/rewards-dashboard-i18n/blob/main/docs/i18n.md)。

### 版本配套关系

| 脚本         | 配套仪表盘      | 说明                                |
| ------------ | --------------- | ----------------------------------- |
| `5.0.0-ch.2` | `v2.0.1-i18n.2` | 日志标题 + 正文中文化，双语模式契约 |
| `5.0.0-ch.1` | `v2.0.1-i18n.1` | 界面中文化（日志正文尚未翻译）      |

---

## 本次改动（相对 `5.0.0-ch.1`）

主题是**工程化与可验证性**，不改变运行时行为。

### 新增

- **中国热搜源单元测试**（`test/china-source.test.cjs`，7 项）
  覆盖 URL 构造、appkey 裁剪、跨源去重、403 限流回落备用源、全源失败、响应结构异常、标题清洗与来源标记。
  `npm test` / `npm run test:china`，CI 在构建后自动执行。
- **CI 流水线**（`.github/workflows/ci.yml`）：lint + 单元测试。
- **GHCR 镜像发布工作流**（`.github/workflows/docker-publish.yml`）
  打 tag 或发 Release 即自动构建推送镜像，同时产出带 `v` / 不带 `v` 的版本标签、`latest`、`v5-china`。
- **配套仪表盘说明**：README 新增「配套仪表盘」章节，两个仓库互相链接。
- **本文档**（`docs/release-notes-v5.0.0-ch.2.md`）。

### 构建

- **Chromium 下载源改为可选**：`ARG PLAYWRIGHT_DOWNLOAD_HOST`，默认走官方 CDN。
  原先硬编码 npmmirror 会 404（该镜像只同步到 chromium revision 1200，而 patchright 1.64.2 需要 1248）。
  国内构建可显式传该参数，但**仅在镜像站已同步对应 revision 时使用**。
- **镜像包名迁移**：`microsoft-rewards-script` → `microsoft-rewards-script-v5`。
  旧包由已删除的旧仓库创建，新仓库的 `GITHUB_TOKEN` 对同名包没有写权限。

### 安全

- 所有示例配置（`env.example` / `config.example.json`）**均为占位符**；
  仓库内不含任何账号、密码、TOTP 密钥、API token 或推送密钥；
  `.env` 已在 `.gitignore` 中，**请勿提交**。

> 注：`v5.0.0-ch.1` 标签在部分工程化提交之后才打下，因此上述构建改动已包含在 `5.0.0-ch.1` 镜像里；
> 本次把它们连同单元测试与配套文档一并归档为 `5.0.0-ch.2`。

---

## 安装

### Docker（推荐）

```bash
docker pull ghcr.io/zpan2327/microsoft-rewards-script-v5:5.0.0-ch.2
```

其他可用标签：

| 标签          | 用途                 |
| ------------- | -------------------- |
| `5.0.0-ch.2`  | 固定版本（推荐）     |
| `v5.0.0-ch.2` | 同上，带 `v` 前缀    |
| `latest`      | 最新构建             |
| `v5-china`    | 跟随 `v5-china` 分支 |

### 从源码构建

```bash
git clone https://github.com/zPan2327/Microsoft-Rewards-Script-Ch.git -b v5-china
cd Microsoft-Rewards-Script-Ch
git checkout v5.0.0-ch.2        # 固定到本版本

cp env.example .env             # 填入账号凭据（示例文件全是占位符）
cp config.example.json config/config.json

docker compose up -d --build
```

### 配套仪表盘

```bash
git clone https://github.com/zPan2327/rewards-dashboard-i18n.git
cd rewards-dashboard-i18n
git checkout v2.0.1-i18n.2      # 与本版本配套

cp .env.example .env            # API_TOKEN 必须与脚本侧完全一致
docker compose up -d --build
```

两个容器在同一 Docker 网络内，仪表盘通过 `http://microsoft-rewards-script:3010`
访问脚本的 Control API，共享同一个 `API_TOKEN`。

---

## 配置要点

完整说明见 [README](../README.md#配置重点)，此处只列与部署相关的：

| 环境变量                                         | 说明                                             |
| ------------------------------------------------ | ------------------------------------------------ |
| `ACCOUNT_N_EMAIL` / `_PASSWORD` / `_TOTP_SECRET` | 账号凭据；编号可跳号，全部放在 `.env`            |
| `API_MODE` / `API_TOKEN`                         | Control API 开关与共享密钥，**必须与仪表盘一致** |
| `CRON_SCHEDULE`                                  | 调度表达式，默认 `0 7 * * *`（每天 07:00）       |
| `CONFIG_CHINA_API_APPKEY`                        | gmya.net 个人配额密钥，可解除免费档限流（可选）  |
| `CONFIG_PUSHPLUS_*` / `CONFIG_SERVERCHAN_*`      | 微信推送（可选）                                 |

> `CONFIG_*` 每次启动都会覆盖 `config/config.json` 的同名项。
> 若想用面板改配置并持久化，请不要在 compose 里设置对应项。

---

## 验证范围

本版本已验证：

- 单元测试 7 项全通过（`npm test`）
- ESLint 无告警
- 容器内 Control API 可正常启动与鉴权
- 与配套仪表盘 `v2.0.1-i18n.2` 联调通过（事件流、账号列表、日志中文化）

**未验证**：真实账号的积分获取结果（依赖账号状态与微软风控，无法在 CI 中覆盖）。

---

## 安全提示

1. **不要提交 `.env`**——示例文件里全是占位符，真实凭据只写在本地 `.env` 中。
2. `API_TOKEN` 请使用长随机串，并保证脚本与仪表盘一致。
3. TOTP 密钥等同于账号第二因素，泄露即等于账号失守，请勿截图或粘贴到 issue。
4. 排查问题时分享日志请注意：**日志正文是英文原文，可能包含邮箱、路径与账号标识**，
   对外分享前请自行脱敏。

---

## 链接

- 源码：<https://github.com/zPan2327/Microsoft-Rewards-Script-Ch>
- 配套仪表盘：<https://github.com/zPan2327/rewards-dashboard-i18n>
- 上游项目：<https://github.com/TheNetsky/Microsoft-Rewards-Script>
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)
- 补丁说明：[PATCHES.md](../PATCHES.md)
- 免责声明：[README.md#免责声明](../README.md#免责声明)
