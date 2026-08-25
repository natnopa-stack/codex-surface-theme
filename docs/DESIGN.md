# 设计基线

暗色模式是 Codex Surface Theme 的唯一正式视觉基线。背景层级、边框、透明度、辉光和文字对比度均针对暗色界面调校；浅色及跟随系统模式不属于当前版本的支持范围。

## 视觉原则

- 最外层保留系统黑色 Canvas；左侧栏、主工作区与可见右栏是独立 Surface；
- 8px 间距、小圆角（默认 12px）、细边框与克制辉光；
- 不使用头像、大回复气泡、立体项目卡、全屏 blur 或厚重阴影；
- 动态颜色只用于 Composer 彩边、状态灯、进度段和小型仪表等信号层；
- 项目颜色与图标只作为导航识别信号，不改变项目结构；
- 切到“原版”才撤下 Surface 组件；
- 不改 Codex 原生发送键、麦克风、`+` 菜单、线程行为、拖放与导航逻辑，视觉层不得遮挡点击区域。

## 组件独立性

- Assistant 状态条、左上角 Online Core、LIVE ACTIVITY 各自有独立开关与独立存储；
- 项目颜色与项目图标按项目独立保存，可一键恢复默认；
- 额度仪表三档、Context 圆环五色均独立持久化；
- 官方主题选择与 Surface 组件分离，但 Surface 的公开验收只覆盖暗色模式。

## 性能约束

- 只读 DOM、React 状态或既有本地查询缓存，不额外消耗模型 Token；
- VOX/Canvas 复用共享动画循环：活跃 30fps、待机 15fps，DPR 自适应，不可见时停止；
- 全页面 MutationObserver 只做注入后的页面内状态同步，不是独立后台 watcher；完整组件刷新限流为每 400ms 一次，另有 2 秒兜底心跳；
- 动画优先使用 `transform`、`opacity`、`background-position`，禁止大面积高频重绘。

## 维护边界

- 日常调参只改 `engine/tuning.css`；
- Codex 更新导致 DOM 变化时才改 `engine/injector.mjs`；
- `engine/skin.css` 与冻结 SVG 是稳定基线，改动必须同步 `theme.json` 哈希、版本号与变更记录。
