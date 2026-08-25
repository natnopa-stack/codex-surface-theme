# 组件动态预览

两张 GIF 均使用虚构项目、任务、账号和数值离线生成，不是用户窗口录屏，也不包含本地路径、线程 ID、端口或真实额度。它们存放在 `docs/media/`，README 使用相对路径引用，因此 GitHub 仓库页面会直接播放。

## 外观控件与四种状态条

![外观设置控件](media/appearance-controls.gif)

展示 Rider、Current、ECG、VOX 四种动态材质，以及 Assistant、Online Core、LIVE ACTIVITY 的独立开关、配色和额度仪表展开状态。

## 项目图标右键样式菜单

![项目图标右键样式菜单](media/project-style-menu.gif)

- 在左侧项目列表中右键项目图标所在行，打开“项目样式”菜单；
- 可选择 8 种颜色和 8 种离线打包的 Tabler Outline 图标；
- 颜色与图标按项目独立保存在本地 `localStorage`；
- “恢复项目默认”会同时清除该项目的自定义颜色与图标。

## 显示边界

- 两张 GIF 只用于 GitHub 与离线文档，主题运行时不会加载；
- 当前公开预览与正式视觉基线均为暗色模式；
- 数据、安全和性能边界见 [SECURITY.md](SECURITY.md) 与 [DESIGN.md](DESIGN.md)。
