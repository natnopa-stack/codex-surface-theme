# Codex Surface Theme

> Unofficial community theme. This project is not affiliated with, endorsed by, or maintained by OpenAI.

> 简体中文：[README.zh-CN.md](README.zh-CN.md)

Codex Surface Theme is a local dark-mode visual theme package for the Windows Codex desktop app. It adds a restrained, flat Surface hierarchy and optional signal components through a one-shot Chrome DevTools Protocol (CDP) injection. It does not modify the official installation and does not keep an independent background process running.

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

## Animated previews

These are deterministic, sanitized component reconstructions—not recordings of a real user window. All project names, task names, status values, and account details are simulated.

![All four animated signal styles, independent switches, and the click-open usage gauge](docs/media/appearance-controls.gif)

![Right-click project styling with eight colors and eight packaged project icons](docs/media/project-style-menu.gif)

The GIFs live in `docs/media/`, render directly on the GitHub repository page, and are not loaded by the theme runtime. See [docs/SHOWCASE.md](docs/SHOWCASE.md) for a component-by-component explanation.

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
