# Codex Surface Theme 1.12.3 发布说明

状态：正式版。面向 Windows Codex 桌面版，Surface 视觉层以**暗色模式**为唯一正式适配基线。

## 安全热修复

- 修复 Launcher 在检测到“Codex 已运行但没有本地主题端点”时，可能自动关闭或强制结束 Codex 进程的问题。
- 现在 Launcher 只返回退出码 `2` 并提示手动退出，不会自动关闭、强制结束或重启 Codex，避免打断正在执行的任务。
- `APPLY-THEME.cmd` 也不再自动进入恢复启动流程；请完成当前任务、从托盘完全退出 Codex，再运行 `LAUNCH-CODEX-THEMED.cmd`。

## 本版重点

- 暗色 Surface 层级：中性 Canvas、独立面板、小圆角、细边框与克制辉光。
- Composer 1px 彩色流光边，保留原生 `+`、模型、语音和发送操作。
- 左侧项目单列树与扁平线程分支；右键项目图标所在行可选择 8 种颜色和 8 种 Tabler Outline 图标，并按项目独立保存。
- 四种 Assistant 状态条：Rider、Current、ECG、VOX。
- Assistant 状态条、Online Core、LIVE ACTIVITY 使用独立开关；LIVE ACTIVITY 只显示可观察到的任务、工具与 Agent 状态。
- Composer Context 圆环五色配色；用户名旁额度仪表支持 `隐藏 / 状态 / 精确`。
- 两张脱敏 GIF 直接用于 GitHub README：外观控件演示与项目右键样式菜单。详见 [SHOWCASE.md](SHOWCASE.md)。

## 性能与本地边界

- 过滤高频流式文字变化、去重组件刷新并避免无变化的 DOM 写入，减少主题观察器自触发和组件互相拖慢。
- VOX 使用单一 DPR 自适应循环，活动最高 30fps、待机最高 15fps，不可见时停止绘制。
- 主题只连接 `127.0.0.1` 的本机 CDP 端点，不访问外部网络，不修改官方安装文件。
- 注入完成后 Node 脚本退出，不保留独立 watcher、后台服务或更新守护进程。
- 主题自身不调用模型/API、不发送提示词，因此不会额外消耗模型 Token。

> Codex 官方 renderer 在超长流式内容中仍可能占用主线程；主题已移除自身主要放大路径，但不能消除官方渲染器内部的全部停帧。

## 安装与更新后恢复

1. 完全退出 Codex，包括托盘进程。
2. 运行 `LAUNCH-CODEX-THEMED.cmd`。
3. 将 Codex 颜色模式设为“深色”，主题选择“Surface”。
4. 使用 `THEME-STATUS.cmd` 做只读状态检查；需要移除时运行 `REMOVE-THEME.cmd`。

Codex 更新后如果主题没有加载，请完全退出更新器启动的 Codex，再从 `LAUNCH-CODEX-THEMED.cmd` 启动。详细说明见 [INSTALL.md](INSTALL.md)、[COMPATIBILITY.md](COMPATIBILITY.md) 和 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

本版本采用 [MIT License](../LICENSE) 发布。
