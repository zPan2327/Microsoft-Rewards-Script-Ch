# Docker 部署配置注意事项

- rewards-dashboard 可编辑的行为配置以 config/config.json 为准，该目录通过 bind mount 持久化。
- 不要在 compose.yaml 中为 dashboard 可编辑的配置设置 CONFIG_* 环境变量，容器启动时会用它们覆盖 config.json。
- 当前 compose.yaml 已移除 CONFIG_* 行为覆盖项，因此网页保存的簇数量、账户间隔、搜索引擎、实验功能、代理和 ClawBot 配置会在容器重启或重建后保留。
- API_ALLOW_CONFIG_WRITE=true 和 API_ALLOW_SCHEDULE_WRITE=true 必须保留，它们允许 dashboard 保存配置和调度。
- ACCOUNT_* 账户信息仍由 .env 提供，修改账户信息后需要重新创建容器。
- config/schedule.json 存在时优先于 CRON_SCHEDULE，网页保存的调度以 schedule.json 为准。
- 不要把密码、TOTP、API Token 或其他凭据提交到 Git。

通过 dashboard 修改后，确认宿主机 config/config.json 已更新，再重启或重建容器验证持久化。
