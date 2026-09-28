# Changelog

This changelog summarizes the complete capabilities of the current public version.

## 1.15.9 — Dark theme

### Surface visual system

- Adds a flat, floating Surface hierarchy with neutral canvas separation, compact radii, fine borders, and restrained shadows.
- Activates Surface only in resolved dark mode, preserves native light appearance, and restores the saved Surface choice on return to dark. Experimental light-sheet code and light-skin controls are excluded.
- Adds a separately switchable thin Composer runner or star particles with custom color while preserving the native `+`, model, voice, and send controls.
- Reworks the sidebar into a single-column project tree with colored trunks, flat thread branches, eight project colors, and eight selectable Tabler Outline project icons.

### Signal effects and controls

- Places Appearance controls in an owned responsive section and the usage gauge in its own navigation-rail slot above the footer.
- Uses compact project spacing, native custom message colors, and an updated native context-ring adapter.
- Rider Online Core runs a 3.2s active cycle and a 5.6s idle cycle.
- Provides four Assistant signal styles: Rider red scanner, violet-white Plasma conductor, green ECG monitor, and VOX oscilloscope.
- Keeps the top-left Online Core, Assistant response indicator, and LIVE ACTIVITY card on separate persistent switches.
- Adds LIVE ACTIVITY accent colors and a compact status card for observable task, tool, and Agent activity. On the new sidebar, the card reserves a responsive footer in the directory column without covering project rows or the navigation rail.
- Adds a five-color native Composer context ring and a native usage gauge with `Hidden`, `Status`, and `Precise` modes.
- Includes historical sanitized animated documentation previews for the Surface overview, all four signal styles, independent switches, and the click-open usage panel.

### Performance and stability

- Excludes activity-card updates from project reconciliation, removes observer feedback loops, and avoids redundant DOM writes.
- Uses a page-local Worker and OffscreenCanvas for VOX so streaming work on the UI thread does not stop waveform drawing; unsupported runtimes fall back to the existing canvas loop. Workers stop drawing when hidden and terminate on removal or reinjection.
- Varies active VOX peak position, width, energy and fine structure with smooth noise while preserving the accepted idle geometry and motion.
- Keeps VOX wave motion continuous at its frame cap, preserves frame deadlines across display refresh rates, and avoids phase jumps after delayed frames.
- Filters high-frequency streaming mutations and deduplicates dynamic component refresh work.
- Limits full status refreshes while retaining lightweight activity-state updates.
- Uses one shared, DPR-aware VOX animation loop capped at 30fps while active and 15fps while idle; drawing stops when the surface is not visible.
- Fixes theme-caused click lag and cross-component animation slowdown without adding a resident watcher or background service.

### Installation, updates, and recovery

- Uses one-shot local CDP injection and exits after application.
- Locates the current AppX-distributed Codex package at launch instead of modifying the official installation.
- Fails closed when an existing Codex session has no local theme endpoint; the launcher never closes, force-terminates, or restarts that process, so active tasks are not interrupted.
- Restores the theme after a Codex update by fully quitting the updater-started process and launching again through `LAUNCH-CODEX-THEMED.cmd`.
- Provides read-only status, removal, package tests, public-file hashes, and a deterministic local release ZIP.

### Privacy and resource boundary

- Does not call a model, submit prompts, create Goals, or add model-token usage.
- Reads only observable renderer state and existing local query cache for LIVE ACTIVITY, context, and usage displays.
- Ships no user paths, runtime records, debugging sessions, private screenshots, task/thread IDs, recovery snapshots, or internal QA artifacts.
- Remains an unofficial Windows community theme with no claim of cross-platform support or invisible reinjection after updates.
