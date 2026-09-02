# Make Your Codex Feel Alive

**Codex Surface Theme** — A KITT-inspired dark interface with reactive signals, live activity, and project customization.

> Unofficial community theme. This project is not affiliated with, endorsed by, or maintained by OpenAI.
>
> 非官方社区主题，与 OpenAI 无关，不由 OpenAI 发布、认可或维护。

**English documentation:** this page · **简体中文完整文档：**[README.zh-CN.md](README.zh-CN.md)

## 让 Codex 有一点生命感

Codex Surface Theme 不只是给 Codex 换一套颜色，而是希望让这个每天陪你工作的工具真正有一点“生命感”。待机时，动态光条会放慢速度、降低亮度；当 Codex 开始思考、调用工具或运行 Agent 任务时，光效会加速并变得更活跃。即使不一直盯着文字输出，也能直观感受到它当前的工作状态。

主题提供四种 Assistant 状态条：灵感来自 KITT 扫描灯的 **Rider**、适合暗色界面的紫白流光 **Current**、会随任务状态改变节奏的 **ECG** 心电图，以及带有放电感的 **VOX** 整流管电流。主输出区域和左上角的紧凑状态条可以分别开启或关闭。

左下角加入了可折叠的 **LIVE ACTIVITY** 卡片。任务运行时，折叠状态会显示动态的 `RUNNING`；展开后可以查看当前模型、工具调用和 Agent 活动的简要信息。Composer 输入框增加了流动光带，项目文件夹的图标和颜色可以通过右键单独更换。设置页面提供动态组件开关和一键恢复原版界面的选项；用户名旁的额度仪表默认只显示电量格，点击后再查看精确百分比。

整个主题以暗色模式为视觉基线，通过本机一次性注入运行，不修改 Codex 官方安装文件，也不会额外调用模型或消耗 Token。

## Make Codex feel alive

Codex Surface Theme is more than a new color palette. It is designed to make the tool you work with every day feel a little more alive. When Codex is idle, the animated light bars slow down and fade into the background. When it starts thinking, calling tools, or running Agent tasks, the animations become brighter and more active, so you can recognize its state without constantly watching the text output.

The theme includes four Assistant signal styles: **Rider**, inspired by KITT’s scanning light; **Current**, a purple-and-white flow designed for the dark interface; **ECG**, a heartbeat display that reacts to task activity; and **VOX**, an electric rectifier-tube effect. The main-output signal and the compact top-left signal can be enabled independently.

A collapsible **LIVE ACTIVITY** card sits in the lower-left corner. While a task is running, its collapsed state shows an animated `RUNNING` label; when expanded, it summarizes the current model, tool calls, and Agent activity. The Composer gains a flowing light accent, project folder icons and colors can be changed from the right-click menu, and the settings page provides individual component switches together with an option to restore the original Codex interface. A compact usage gauge beside the username shows battery-style bars by default and reveals the exact percentage when clicked.

The theme is built around dark mode and runs through one-shot local injection. It does not modify the official Codex installation, make additional model requests, or consume extra model tokens.

## 动态预览 / Animated previews

以下 GIF 是使用公开样式重建的脱敏组件演示，不是真实用户窗口录像；项目名、任务名、状态值和账号信息均为模拟数据。

The following GIFs are deterministic, sanitized component reconstructions rather than recordings of a real user window. Project names, task names, status values, and account details are simulated.

### Assistant 状态、LIVE ACTIVITY 与额度仪表 / Assistant signals, LIVE ACTIVITY, and usage gauge

![Four Assistant signal styles, independent switches, LIVE ACTIVITY, and the click-open usage gauge](docs/media/appearance-controls.gif)

### 项目图标与颜色 / Project icon and color customization

![Right-click project styling with eight colors and eight packaged project icons](docs/media/project-style-menu.gif)

两张 GIF 位于 `docs/media/`，会直接显示在 GitHub 仓库首页，主题运行时不会加载它们。详细说明见 [docs/SHOWCASE.md](docs/SHOWCASE.md)。

Both GIFs live in `docs/media/`, render directly on the GitHub repository page, and are not loaded by the theme runtime. See [docs/SHOWCASE.md](docs/SHOWCASE.md) for a component-by-component explanation.

## Status

- Theme version: `1.12.3` ([theme.json](theme.json))
- Package ID: `local.codex.surface-theme`
- Injection mode: `one-shot-cdp`
- Supported Surface color mode: Codex `Dark`
- Background process: none
- Validated baseline: Codex `26.803.10989.0`
- Update recovery validated with: Codex `26.810.7004.0`
- License: [MIT](LICENSE).

## Features

- Dark-mode Surface hierarchy with neutral canvas separation, compact radii, fine borders, and restrained glow.
- A 1px animated Composer runner that preserves all native Composer controls.
- Single-column project tree with flat thread branches.
- Right-click project styling: choose one of eight colors and eight packaged Tabler Outline icons; preferences are stored independently per project.
- Four Assistant signal styles: `rider`, `current`, `ecg`, and `vox`.
- Independent switches for the top-left Online Core, Assistant response indicator, and LIVE ACTIVITY card.
- LIVE ACTIVITY based only on observable task, tool, and Agent state; it never invents a completion percentage.
- Composer context-ring recoloring with five accent presets.
- Integrated usage gauge beside the account area with `Hidden`, `Status`, and `Precise` modes.
- Selecting `Official` removes all Surface components; selecting `Surface` restores them. The Surface visual layer is formally supported only in Codex Dark mode.

See [docs/USAGE.md](docs/USAGE.md) for the complete control reference.

## Requirements

- Windows
- AppX-distributed Codex desktop app (`OpenAI.Codex`)
- Node.js 22 or newer
- Windows PowerShell 5.1 or newer

For installation details and the exact security boundary, read [docs/INSTALL.md](docs/INSTALL.md) first.

## Quick start

1. Fully quit Codex, including the tray process.
2. Run `LAUNCH-CODEX-THEMED.cmd`. The launcher locates the newest installed Codex package, allocates a local debugging port, starts Codex through AppX activation, and performs one injection.
3. Run `THEME-STATUS.cmd` to confirm that the theme and optional components are mounted.
4. In Codex Appearance settings, use the `Dark` color mode and select `Surface`. Select `Official` whenever you need the untouched official layout.
5. To remove the injection from the current window, run `REMOVE-THEME.cmd`.

> After a Codex update, the updater may restart Codex outside the themed launch path and without a debugging port. Fully quit that process and run `LAUNCH-CODEX-THEMED.cmd` again. The theme does not claim persistent or invisible reinjection. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Commands

| Entry point | Purpose |
| --- | --- |
| `APPLY-THEME.cmd` | Inject once into an already-running Codex session that has a local debugging endpoint |
| `LAUNCH-CODEX-THEMED.cmd` | Locate the latest Codex package, launch it, and apply the theme |
| `REMOVE-THEME.cmd` | Remove the current-window injection and restore the official layout |
| `THEME-STATUS.cmd` | Read-only report for mount state, switches, component counts, and injector watcher count |
| `TEST-THEME-PACKAGE.cmd` | Validate required files, JSON, JavaScript syntax, frozen hashes, public media, and package gates |
| `BUILD-RELEASE.cmd` | Regenerate `SHA256SUMS.txt` and build the deterministic local release ZIP in `dist/` |

## Architecture and data boundary

- The PowerShell launcher and apply scripts use only a local loopback CDP endpoint for one-time injection.
- `engine/injector.mjs` mounts controls and reads state already held by the Codex renderer.
- The theme does not access external networks, call a model, submit prompts, create Goals, or add model-token usage.
- LIVE ACTIVITY, context, and usage displays read existing renderer state or local query cache. Missing data is shown as unavailable rather than fabricated.
- The VOX canvas shares one animation loop, is capped at 30fps while active and 15fps while idle, and stops when not visible.
- The Node injection process exits after applying the theme; no independent watcher, service, or updater hook remains running.

More detail is available in [docs/DESIGN.md](docs/DESIGN.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Repository layout

```text
engine/         Theme runtime: CSS, injector, config, and packaged SVG assets
qa/             Local CDP regression scripts
docs/           Installation, usage, design, compatibility, troubleshooting, and security docs
docs/media/     Sanitized public preview GIFs shown by GitHub
theme.json      Version, entry points, features, runtime files, and frozen SHA-256 values
SHA256SUMS.txt  Hashes for every public file in the release package
dist/           Locally generated ZIP and sidecar hash (ignored by Git)
```

## Development and maintenance

- Routine color, brightness, speed, size, spacing, and radius changes belong in `engine/tuning.css`.
- Change `engine/injector.mjs` only when a Codex update changes the DOM or state source.
- If `engine/skin.css` or a frozen SVG changes intentionally, update the version, baseline SHA-256 values, changelog, and verification evidence together.
- Before preparing a release, run `TEST-THEME-PACKAGE.cmd`, then `BUILD-RELEASE.cmd`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution rules.

## Third-party material and licensing

- Tabler Icons are packaged offline under the MIT License (© 2020–2026 Paweł Kuna). The license text is included at `engine/assets/tabler-project-icons/LICENSE.txt`.
- Codex Surface Theme is released under the [MIT License](LICENSE).
- Attribution, unofficial status, and redistribution boundaries are summarized in [NOTICE.md](NOTICE.md).
