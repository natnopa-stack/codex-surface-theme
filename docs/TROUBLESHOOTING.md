# 故障排查

| 症状 | 可能原因 | 处理 |
| --- | --- | --- |
| 主题消失，但文件都还在 | Codex 自动更新后自行重启，新进程没有本地调试端口 | 完全退出 Codex（含托盘）→ `LAUNCH-CODEX-THEMED.cmd` → `THEME-STATUS.cmd` |
| `THEME_APPLIED=0`、退出码 2 | 没有发现可注入的 CDP 会话 | 用 Launcher 启动；不要期待对已运行的无端口实例自动补开端口 |
| `THEME-STATUS` 显示 `CodexRunning=False` | 当前没有可注入会话（不代表系统里没有 Codex 进程） | 完全退出后用 Launcher 启动 |
| 页面颜色发灰、发白或对比度异常 | Codex 当前使用浅色或跟随系统模式 | 将颜色模式改为“深色”；Surface 当前只正式适配暗色 |
| 右键项目没有样式菜单 | 右键位置不在项目行，或 Codex 更新改变项目 DOM | 在左侧项目图标所在行右键；仍无效时按兼容性流程检查选择器 |
| `TEST-THEME-PACKAGE` 的 Node 语法检查失败 | Node.js 缺失或版本过低（需要 22+） | 安装/升级 Node.js 后重试 |
| `TEST-THEME-PACKAGE` 冻结基线 FAIL | 文件被改动或包不完整 | 对照 `SHA256SUMS.txt` 校验；不要手动改 `engine/skin.css` |
| 视觉错位但挂载正常 | Codex 更新改变了 DOM/样式结构 | 按 [COMPATIBILITY.md](COMPATIBILITY.md) 更新检查顺序处理 |
| `REMOVE-THEME.cmd` 提示没有会话 | 当前窗口没有注入或 Codex 已关闭 | 无需处理；运行记录已被清除 |
| 想临时看官方原版 | — | `设置 > 外观 > 主题` 选“原版”；切回“Surface”恢复 |
| 日志在哪里 | — | `engine/surface-theme.log`（仅本机；`*.log` 已被 `.gitignore` 排除） |

## 判断“包损坏”还是“启动通道问题”

- 包完整：`TEST-THEME-PACKAGE.cmd` 全部通过，且 `SHA256SUMS.txt` 校验一致；
- 启动通道问题：`THEME-STATUS` 的 `CodexRunning=False`、`Installed=False`，但包测试通过 → 是无 CDP 会话，不是 CSS/DOM 损坏；
- DOM 兼容问题：包测试通过、有会话且 `Installed=True`，但组件计数为 0 或视觉错位 → 按选择器适配流程处理。

## 敏感故障信息

排查时不要把 `runtime.json`（含本机调试端口、PID）或本地截图提交到公开仓库；它们属于本机运行记录。
