# 贡献指南

## 范围

本仓库只维护 Codex Surface Theme 本身：视觉样式、注入器、QA 与更新适配。不读取、不修改、不启动、不适配任何外部皮肤程序；不修改官方 Codex 安装文件；不迁移目录、不发布插件。

## 修改边界

| 修改类型 | 入口 |
| --- | --- |
| 日常颜色、亮度、速度、尺寸、间距、圆角 | `engine/tuning.css` |
| Codex 更新导致 DOM/状态来源变化 | `engine/injector.mjs` |
| 稳定基线（`engine/skin.css`、冻结 SVG） | 仅在有意的基线修订时；必须同步 `theme.json` 的 SHA-256、版本号、变更记录 |

规则：

- 选择器优先使用稳定语义属性与已有 `data-codex-*` 标记；不依赖随机类名、固定安装目录或脆弱 DOM 层级序号；
- 不引入常驻 watcher、后台服务或轮询；注入器保持一次性退出；
- 不增加模型调用、提示词发送或 Goal 创建；运行时只读 DOM/React 状态/既有本地查询缓存；
- 动画优先 `transform`/`opacity`/`background-position`；VOX 活跃 30fps、待机 15fps，DPR 自适应，不可见时停止。

## 本地验证

```powershell
# 语法检查
node --check engine/injector.mjs
Get-ChildItem qa -Filter *.mjs | ForEach-Object { node --check $_.FullName }

# 包级门禁
TEST-THEME-PACKAGE.cmd

# 只读状态（需要已启动的 Codex 会话）
THEME-STATUS.cmd
```

QA 脚本通过参数接收调试端口，只连接 `127.0.0.1`：

```text
node qa/indicator-independence-qa.mjs <debug-port>
node qa/adaptive-indicator-qa.mjs <port> <light|dark> <rider|current|ecg|vox> <idle|active> <output.png>
node qa/vox-response-qa.mjs <debug-port> <output.png>
node qa/activity-widget-qa.mjs <debug-port> [--probe]
node qa/usage-gauge-qa.mjs <debug-port> [output-dir]
```

## 发布构建

发布前运行 `BUILD-RELEASE.cmd`（或 `powershell -File Build-Release.ps1`）：先执行包级门禁，再重新生成 `SHA256SUMS.txt` 与 `dist/` 发布 ZIP 及 sidecar 哈希。构建脚本只打包公开文件，自动排除 `AGENTS.md`、`RELEASE-INTERNAL/`、`dist/`、运行时日志（`*.log`）与机器专用文件。

有意的内容变更后，清单中的哈希会先过期：首次构建用 `powershell -File Build-Release.ps1 -SkipTest` 引导重建清单与 ZIP，随后运行 `TEST-THEME-PACKAGE.cmd` 验证全树，再运行一次带门禁的 `BUILD-RELEASE.cmd` 确认闭环。

## 提交约定

- 每次用户可见修改更新 `CHANGELOG.md`（版本号 + 日期 + 行为/证据）；
- 修改冻结文件时先更新 manifest/hash，再验证；
- 提交中不得包含：`runtime.json`、`recovery-state.json`、快捷方式备份、私有截图、机器路径、线程/任务 ID、端口与 PID；
- 报告兼容性时注明实测 Codex 版本，区分“启动通道失败”与“DOM 选择器失败”。
