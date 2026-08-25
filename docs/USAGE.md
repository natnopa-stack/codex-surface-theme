# 使用说明

## 标准入口

| 命令 | 行为 |
| --- | --- |
| `APPLY-THEME.cmd` | 向已开启本地调试端口的当前 Codex 一次性注入；找不到会话时退出码 2 |
| `LAUNCH-CODEX-THEMED.cmd` | 定位最新 Codex 并启动，然后注入；已有可注入会话时直接应用 |
| `REMOVE-THEME.cmd` | 移除当前窗口注入并恢复官方布局 |
| `THEME-STATUS.cmd` | 只读状态：挂载、开关、组件计数、注入器 watcher 数量 |
| `TEST-THEME-PACKAGE.cmd` | 静态验证包完整性 |

注入器是一次性的：每次应用后 Node 脚本立即退出，不保留独立 watcher、后台服务或轮询进程。

不含用户数据的组件动图与开关关系见 [SHOWCASE.md](SHOWCASE.md)。

## 正式支持的外观模式

- **颜色模式**：仅正式支持 Codex `深色`。浅色与跟随系统模式尚未完整匹配，不作为当前版本的适配范围。
- **主题**：`原版 / Surface`。选择“原版”会撤下全部 Surface 组件；切回“Surface”恢复。

安装完成后，建议先将 Codex 颜色模式设为“深色”，再选择“Surface”。

## 外观控件（设置 > 外观）

- **Assistant 状态条**：控制每轮回复顶部的动态线。样式：游侠红 `rider`、紫白呼吸 `current`、心电绿 `ecg`、VOX 电波 `vox`。
- **左上角在线灯（Online Core）**：独立控制侧栏顶部在线核心。
- **LIVE ACTIVITY**：独立开关 + 六档配色，只影响侧栏活动卡片。
- **额度仪表**：`隐藏 / 状态 / 精确` 三档。默认“状态”只显示五格容量，点击后展开精确信息。
- **Composer 上下文圆环**：原位接管 Context 圆环并允许五色快捷配色。

Assistant 状态条、Online Core、LIVE ACTIVITY 的开关完全独立，互不联动。

## 项目颜色与图标

1. 在左侧 `Projects` 列表中，右键项目图标所在行。
2. 在“项目样式”菜单中选择图标或颜色；菜单会在选择后关闭。
3. 每个项目独立保存，可使用 8 种颜色和 8 种 Tabler Outline 图标。
4. 点击“恢复项目默认”可同时清除该项目的颜色与图标覆盖。

该设置只影响项目外观，不修改项目文件、目录名称或 Codex 项目数据。

## 偏好保存

所有外观偏好保存在 Codex 渲染器的 `localStorage`，键名以 `codex.` 为前缀。重新注入或切换“原版 / Surface”不会清空偏好；卸载主题也不会破坏 Codex 用户数据。

## 数据来源

LIVE ACTIVITY、Context 圆环与额度仪表只读取 Codex 渲染器已经维护的 Store/查询缓存（如 `threadRuntimeStatus`、`latestTokenUsageInfo`、`rate-limit-status`），不发送模型请求、不访问外部网络、不伪造百分比。

## 活动状态文本

LIVE ACTIVITY 的活动与 Agent 状态文本以英文为准（`READY` / `Running` / `Complete`、`STATUS` 标签、`done / total` 计数与 Agent 名称）。当前版本不额外做中文或双语本地化。
