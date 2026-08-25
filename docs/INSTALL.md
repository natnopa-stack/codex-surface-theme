# 安装与卸载

## 前置条件

- Windows 10/11；
- Codex 桌面版（Microsoft Store / AppX 分发，包名 `OpenAI.Codex`）；
- Node.js 22 或更高（注入器依赖全局 `fetch` 与 `WebSocket`）；
- Windows PowerShell 5.1 或更高。

本主题只支持上述 Windows + AppX 组合；Surface 视觉层仅正式适配 Codex 深色模式。

## 安装

1. 将发布包解压到任意可写目录。
2. 从托盘完全退出 Codex，确保没有 Codex 进程在运行。
3. 双击 `LAUNCH-CODEX-THEMED.cmd`：
   - Launcher 通过 `Get-AppxPackage -Name OpenAI.Codex` 定位最新安装，并经 AppX 应用激活接口启动；
   - 分配随机本地调试端口并启动 Codex；
   - 调用 `Apply-Theme.ps1` 完成一次性注入，Node 注入器随即退出。
4. 在 Codex 外观设置中将颜色模式设为“深色”，主题选择“Surface”。
5. 运行 `THEME-STATUS.cmd`，确认 `PackageReady=True`、`Installed=True`、`InjectorWatchers=0`。

如果 Codex 已经以本地调试端口运行，也可以直接双击 `APPLY-THEME.cmd`；脚本会等待最多 5 秒发现可注入会话。

## 验证

- `TEST-THEME-PACKAGE.cmd`：校验文件完整性、JSON、Node 语法、冻结基线 SHA-256 与功能门禁；
- `THEME-STATUS.cmd`：只读查询当前会话的挂载状态与组件计数；
- 右键任一项目图标所在行，应出现项目颜色与图标选择菜单；
- `SHA256SUMS.txt`：全包哈希校验命令见 [SECURITY.md](SECURITY.md)。

## 卸载

- `REMOVE-THEME.cmd`：从当前窗口移除注入并恢复官方布局，同时清除本机运行记录。
- 如果窗口已关闭，主题随 Codex 进程退出自然消失，无需额外操作。
- 彻底移除：删除解压目录即可；主题不修改官方安装文件，也没有注册表项或服务。

## 更新 Codex 之后

Codex 自动更新后若自行重启，更新器直接启动的进程没有本地调试端口，主题不会自动恢复。请完全退出 Codex，再运行 `LAUNCH-CODEX-THEMED.cmd`。详见 [COMPATIBILITY.md](COMPATIBILITY.md) 与 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
