# 兼容性说明

## 已验证环境

| 项目 | 值 |
| --- | --- |
| 操作系统 | Windows 10/11 |
| Codex 分发 | Microsoft Store / AppX（包名 `OpenAI.Codex`） |
| Surface 颜色模式 | 深色（唯一正式适配基线） |
| 基线验证 | Codex `26.803.10989.0` |
| 更新恢复验证 | Codex `26.810.7004.0`（事件 `UPDATE-2026-08-15-26.810.7004`） |
| 注入方式 | 一次性 CDP 注入（`one-shot-cdp`） |
| 后台进程 | 无 |

## 已验证行为

- Launcher 每次通过 `Get-AppxPackage -Name OpenAI.Codex` 定位最新安装包并派生 `AppUserModelId`，不写死版本路径；
- 每次启动动态分配本地调试端口（`127.0.0.1`）；
- 项目颜色、项目图标及其他外观偏好保存在 `localStorage`，重新注入或切换“原版 / Surface”不丢失；
- 更新后从主题入口完全重启，可在新版上恢复挂载。
- 若检测到未带本地主题端点的运行中 Codex，Launcher 会安全退出并返回码 `2`，不会关闭、强制结束或自动重启现有进程；

## 已知边界（不做虚假承诺）

1. **Windows + AppX 专属**：不提供 macOS/Linux/Web 支持。
2. **暗色模式基线**：浅色与跟随系统模式尚未完整匹配；使用 Surface 时应选择 Codex 深色模式。
3. **一次性注入**：主题只在注入后的窗口生命周期内存在；Codex 关闭后注入消失，需要从主题入口再次启动。
4. **更新器自动重启不自动恢复**：Codex 自动更新后自行启动的新进程没有本地调试端口，主题不会自动出现；必须完全退出后运行 `LAUNCH-CODEX-THEMED.cmd`。当前实现有意不引入独立 watcher 或后台服务。
5. **DOM 兼容不是零风险**：Codex 更新可能改变 DOM、React Store 或 aria-label，旧选择器可能失效。
6. **不修改官方安装与偏好**：不替换 Codex 程序，也不锁死官方颜色模式；切到“原版”后仍可使用 Codex 自带外观。
7. **网络与 Token 边界**：运行时只连接本机回环调试端点；不访问外部网络、不调用模型、不发送提示词，因此不会额外消耗模型 Token；不伪造进度或百分比。

## 更新检查顺序

1. 完全退出，从主题入口重新启动；
2. 确认 Codex 颜色模式为“深色”、主题为“Surface”；
3. 运行 `THEME-STATUS.cmd`；
4. 运行 `TEST-THEME-PACKAGE.cmd`；
5. 检查 Surface、Composer `+` 菜单、项目右键样式菜单、线程图标、LIVE ACTIVITY 与额度仪表；
6. 若挂载计数为 0，优先更新 `engine/injector.mjs` 的语义选择器；
7. 若结构在但视觉错位，再更新 `engine/skin.css` / `engine/tuning.css`；
8. 修复后更新 `theme.json` 哈希与版本并重新验证。

选择器优先使用稳定语义属性（`data-app-*`、`data-composer-*`、aria-label、结构关系），不依赖随机构建类名。
