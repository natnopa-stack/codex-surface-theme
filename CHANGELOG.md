# Changelog

## 1.12.3 — 2026-08-24

### Added

- Dark-mode Surface hierarchy and 1px animated Composer runner.
- Single-column project tree with flat thread branches.
- Right-click project styling with eight colors, eight packaged Tabler Outline icons, per-project persistence, and reset-to-default.
- Rider, Current, ECG, and VOX Assistant signal styles.
- Independent controls for Assistant, Online Core, LIVE ACTIVITY, Context accent, and the usage gauge.
- Sanitized GitHub preview GIFs for appearance controls and the project-style context menu.

### Fixed

- Removed theme-side observer feedback loops and redundant DOM writes.
- Deduplicated dynamic refresh work during high-frequency streaming updates.
- Limited full status refreshes while keeping lightweight activity-state updates responsive.
- Consolidated VOX drawing into one DPR-aware loop capped at 30fps active / 15fps idle and stopped when hidden.

### Boundaries

- Windows AppX desktop build only.
- Surface is formally supported in Codex Dark mode; light and system-following modes are not part of the current visual baseline.
- One-shot local CDP injection only: no official-install modification, external-network access, independent background watcher, or invisible reinjection after updates.
- The theme does not call a model, submit prompts, create Goals, or add model-token usage.
