import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function option(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

const host = option("--host", "127.0.0.1");
const port = Number(option("--port", "9228"));
const cssPath = path.resolve(option("--css", path.join(here, "skin.css")));
const mode = process.argv.includes("--remove")
  ? "remove"
  : process.argv.includes("--diagnose")
    ? "diagnose"
  : process.argv.includes("--status")
    ? "status"
  : process.argv.includes("--watch")
    ? "watch"
    : "once";
const timeoutMs = Number(option("--timeout-ms", "30000"));
const activateSurface = process.argv.includes("--activate-surface");
const readyFilePath = option("--ready-file")
  ? path.resolve(option("--ready-file"))
  : null;
const styleId = "codex-surface-theme-package";
const legacyStyleIds = ["codex-user-skin-frost"];
const logPath = path.join(here, "surface-theme.log");
const configPath = path.join(here, "skin.config.json");
const tuningPath = path.join(here, "tuning.css");
const previewConfigPath = path.join(here, "preview.config.json");
const previewBackgroundPath = path.join(here, "preview-background.jpg");
const liveRefreshPausePath = path.join(here, "live-refresh.pause");
const projectIconAssetDirectory = path.join(here, "assets", "tabler-project-icons");
const projectIconAssetFiles = {
  branch: "git-branch.svg",
  layers: "layers-subtract.svg",
  database: "database.svg",
  chart: "chart-line.svg",
  terminal: "terminal-2.svg",
  code: "code.svg",
  book: "book-2.svg",
  tools: "tools.svg",
};
let readyReported = false;

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error(`Invalid debugging port: ${port}`);
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  process.stdout.write(`${line}\n`);
  if (mode === "status") return; // Read-only queries never touch the package tree.
  try {
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // Logging must never prevent the skin from loading.
  }
}

function reportReady(target) {
  if (!readyFilePath || readyReported) return;
  fs.writeFileSync(
    readyFilePath,
    JSON.stringify({ ready: true, targetId: target.id, at: new Date().toISOString() }),
    "utf8",
  );
  readyReported = true;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function previewIsActive() {
  if (!fs.existsSync(previewConfigPath)) return false;
  try {
    const candidate = JSON.parse(
      fs.readFileSync(previewConfigPath, "utf8").replace(/^\uFEFF/, ""),
    );
    const previewPid = Number(candidate.previewProcessId);
    if (!Number.isInteger(previewPid) || previewPid <= 0) return false;
    process.kill(previewPid, 0);
    return true;
  } catch {
    return false;
  }
}

function discardStalePreview() {
  if (!fs.existsSync(previewConfigPath) || previewIsActive()) return false;
  try { fs.rmSync(previewConfigPath, { force: true }); } catch {}
  try { fs.rmSync(previewBackgroundPath, { force: true }); } catch {}
  return true;
}

function loadBackgroundCss() {
  discardStalePreview();
  const usePreview = previewIsActive();
  const activeConfigPath = usePreview ? previewConfigPath : configPath;
  if (!fs.existsSync(activeConfigPath)) {
    return { css: "", backgroundMode: "native", wallpaperEnabled: false };
  }
  const raw = fs.readFileSync(activeConfigPath, "utf8").replace(/^\uFEFF/, "");
  const config = JSON.parse(raw);
  const backgroundMode = ["native", "gradient", "image"].includes(config.backgroundMode)
    ? config.backgroundMode
    : config.backgroundEnabled
      ? "image"
      : "gradient";

  const sidebarOverlay = clamp(
    Number(config.sidebarOverlay ?? config.backgroundOverlay ?? 0.58),
    0,
    0.9,
  );
  const canvasOverlay = clamp(Number(config.canvasOverlay ?? 0.75), 0, 0.98);
  const configuredWallpaperOpacity = clamp(Number(config.backgroundOpacity ?? 1), 0, 1);
  const sidebarBlur = clamp(Number(config.sidebarBlur ?? 16), 0, 40);
  const canvasBlur = clamp(Number(config.canvasBlur ?? 3), 0, 20);
  const glassOpacity = clamp(Number(config.glassOpacity ?? 0.74), 0.2, 0.95);
  // Large blur radii force Chromium to repaint wide translucent surfaces on
  // every streamed update. Keep the glass effect, but cap its live cost.
  const glassBlur = clamp(Number(config.glassBlur ?? 14), 0, 16);
  const booleanSetting = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    return ![false, 0, "0", "false", "off"].includes(
      typeof value === "string" ? value.toLowerCase() : value,
    );
  };
  const panelLayout = ["native", "floating"].includes(config.panelLayout)
    ? config.panelLayout
    : "floating";
  const panelGap = clamp(Number(config.panelGap ?? 10), 6, 18);
  const panelRadius = clamp(Number(config.panelRadius ?? 18), 8, 24);
  const panelBorderStrength = clamp(Number(config.panelBorderStrength ?? 0.36), 0, 1);
  const panelShadow = booleanSetting(config.panelShadow, true);
  const glowEnabled = booleanSetting(config.glowEnabled, true);
  const glowIntensity = clamp(Number(config.glowIntensity ?? 0.42), 0, 1);
  const assistantSurface = booleanSetting(config.assistantSurface, true);
  const sidebarSurfaceAlpha = clamp(0.46 + sidebarOverlay * 0.48, 0.46, 0.9);
  const canvasSurfaceAlpha = clamp(0.64 + canvasOverlay * 0.26, 0.64, 0.9);
  const panelBorderLightAlpha = 0.035 + panelBorderStrength * 0.09;
  const panelBorderDarkAlpha = 0.055 + panelBorderStrength * 0.16;
  const wallpaperOpacity = backgroundMode === "gradient" ? 1 : configuredWallpaperOpacity;
  const allowedPositions = new Set(["center", "left", "right", "top", "bottom"]);
  const position = allowedPositions.has(config.backgroundPosition)
    ? config.backgroundPosition
    : "center";
  const allowedFits = new Map([
    ["cover", "cover"],
    ["contain", "contain"],
    ["stretch", "100% 100%"],
  ]);
  const wallpaperSize = allowedFits.get(config.backgroundFit) ?? "cover";

  let wallpaperVariable = "";
  const wallpaperEnabled = backgroundMode !== "native";
  const hex = (value, fallback) =>
    /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  const rgba = (color, alpha) => {
    const value = Number.parseInt(color.slice(1), 16);
    return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${alpha})`;
  };
  if (wallpaperEnabled) {
    if (backgroundMode === "image") {
      const assetPath = path.resolve(here, String(config.backgroundAsset));
      const relative = path.relative(here, assetPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Background asset must stay inside the skin folder");
      }
      if (!fs.existsSync(assetPath)) {
        throw new Error(`Background asset does not exist: ${assetPath}`);
      }

      const extension = path.extname(assetPath).toLowerCase();
      const mimeTypes = new Map([
        [".jpg", "image/jpeg"],
        [".jpeg", "image/jpeg"],
        [".png", "image/png"],
        [".gif", "image/gif"],
        [".webp", "image/webp"],
      ]);
      const mimeType = mimeTypes.get(extension);
      if (!mimeType) throw new Error(`Unsupported background format: ${extension}`);
      const bytes = fs.readFileSync(assetPath);
      if (bytes.length > 20 * 1024 * 1024) throw new Error("Background asset is larger than 20 MB");
      const dataUri = `data:${mimeType};base64,${bytes.toString("base64")}`;
      wallpaperVariable = `--frost-wallpaper-image: url(${JSON.stringify(dataUri)});`;
    } else {
      const base = hex(config.baseColor, "#D7D8D7");
      const left = hex(config.leftGradientColor, "#E4E1D9");
      const right = hex(config.rightGradientColor, "#D9E0E2");
      const leftStrength = clamp(Number(config.leftGradientStrength ?? 0.3), 0, 1);
      const rightStrength = clamp(Number(config.rightGradientStrength ?? 0.28), 0, 1);
      wallpaperVariable = `--frost-wallpaper-image:
        radial-gradient(circle at 8% 18%, ${rgba(left, leftStrength)} 0, transparent 52%),
        radial-gradient(circle at 92% 78%, ${rgba(right, rightStrength)} 0, transparent 54%),
        linear-gradient(135deg, ${base}, ${base});`;
    }
  }

  return {
    wallpaperEnabled,
    backgroundMode,
    panelLayout,
    panelShadow,
    glowEnabled,
    assistantSurface,
    css: `
:root {
  ${wallpaperVariable}
  --frost-sidebar-opacity: ${sidebarOverlay};
  --frost-canvas-opacity: ${canvasOverlay};
  --frost-wallpaper-opacity: ${wallpaperOpacity};
  --frost-sidebar-blur: ${sidebarBlur}px;
  --frost-canvas-blur: ${canvasBlur}px;
  --frost-glass-opacity: ${glassOpacity};
  --frost-glass-blur: ${glassBlur}px;
  --frost-wallpaper-position: ${position};
  --frost-wallpaper-size: ${wallpaperSize};
  --skin-panel-gap: ${panelGap}px;
  --skin-panel-radius: ${panelRadius}px;
  --skin-panel-border-light: rgb(42 42 38 / ${panelBorderLightAlpha.toFixed(3)});
  --skin-panel-border-dark: rgb(255 255 255 / ${panelBorderDarkAlpha.toFixed(3)});
  --skin-sidebar-surface-alpha: ${sidebarSurfaceAlpha.toFixed(3)};
  --skin-canvas-surface-alpha: ${canvasSurfaceAlpha.toFixed(3)};
  --skin-glow-opacity: ${(glowEnabled ? glowIntensity : 0).toFixed(3)};
  --skin-response-glow-opacity: ${(glowEnabled ? glowIntensity * 0.42 : 0).toFixed(3)};
  --skin-stream-glow-opacity: ${(glowEnabled ? glowIntensity * 0.7 : 0).toFixed(3)};
}`,
  };
}

function buildApplyExpression() {
  const skinConfig = loadBackgroundCss();
  const electricArcPath = path.join(here, "assets", "assistant-electric-arc-sprite.svg");
  const voxWaveformPath = path.join(here, "assets", "assistant-vox-waveform.svg");
  let electricArcCss = "";
  if (fs.existsSync(electricArcPath)) {
    const bytes = fs.readFileSync(electricArcPath);
    if (bytes.length <= 128 * 1024) {
      electricArcCss = `\n:root { --surface-assistant-current-arc-image: url(\"data:image/svg+xml;base64,${bytes.toString("base64")}\"); }`;
    }
  }
  let voxWaveformCss = "";
  if (fs.existsSync(voxWaveformPath)) {
    const bytes = fs.readFileSync(voxWaveformPath);
    if (bytes.length <= 128 * 1024) {
      voxWaveformCss = `\n:root { --surface-assistant-vox-waveform-image: url(\"data:image/svg+xml;base64,${bytes.toString("base64")}\"); }`;
    }
  }
  const tuningCss = fs.existsSync(tuningPath)
    ? fs.readFileSync(tuningPath, "utf8")
    : "";
  const projectIconMarkup = Object.fromEntries(
    Object.entries(projectIconAssetFiles).map(([iconId, fileName]) => {
      const assetPath = path.join(projectIconAssetDirectory, fileName);
      if (!fs.existsSync(assetPath)) throw new Error(`Missing Tabler project icon: ${fileName}`);
      const markup = fs.readFileSync(assetPath, "utf8").replace(/^\uFEFF/, "");
      if (Buffer.byteLength(markup, "utf8") > 16 * 1024 || !markup.includes("<svg")) {
        throw new Error(`Invalid Tabler project icon: ${fileName}`);
      }
      return [iconId, markup];
    }),
  );
  const css = `${fs.readFileSync(cssPath, "utf8")}\n${electricArcCss}\n${voxWaveformCss}\n${skinConfig.css}\n${tuningCss}`;
  return `(() => {
  const id = ${JSON.stringify(styleId)};
  const legacyIds = ${JSON.stringify(legacyStyleIds)};
  const css = ${JSON.stringify(css)};
  const projectIconMarkup = ${JSON.stringify(projectIconMarkup)};
  const forceSurface = ${JSON.stringify(activateSurface)};
  const defaultSelection = ${JSON.stringify(skinConfig.backgroundMode === "native" ? "official" : "surface")};
  const storageKey = "codex.surface-layout.v2";
  const legacyStorageKey = "codex.surface-theme.v1";
  const assistantIndicatorStorageKey = "codex.assistant-indicator.v1";
  const assistantIndicatorEnabledStorageKey = "codex.assistant-indicator-enabled.v1";
  const assistantIndicatorPlacementStorageKey = "codex.assistant-indicator-placement.v1";
  const onlineCoreEnabledStorageKey = "codex.online-core-enabled.v1";
  const liveActivityEnabledStorageKey = "codex.live-activity-enabled.v1";
  const liveActivityAccentStorageKey = "codex.live-activity-accent.v1";
  const usageGaugeModeStorageKey = "codex.usage-gauge-mode.v1";
  const activeValue = "surface";
  const assistantIndicatorValues = new Set(["rider", "current", "ecg", "vox"]);
  const assistantIndicatorPlacementValues = new Set(["response", "corner"]);
  const controllerKey = "__codexSurfaceLayoutController";
  const legacyControllerKey = "__codexSurfaceThemeController";
  const root = document.documentElement;
  const projectColorStorageKey = "codex.sidebar-project-colors.v1";
  const projectIconStorageKey = "codex.sidebar-project-icons.v1";
  const contextAccentStorageKey = "codex.footer-context-accent.v1";
  const projectRowSelector = "[data-app-action-sidebar-project-row]";
  const projectColorAttribute = "data-codex-project-color";
  const projectGridAttribute = "data-codex-project-grid";
  const projectGridItemAttribute = "data-codex-project-grid-item";
  const projectCardAttribute = "data-codex-project-card";
  const projectExpandedAttribute = "data-codex-project-expanded";
  const projectIconAttribute = "data-codex-project-icon";
  const threadRowSelector = "[data-app-action-sidebar-thread-row]";
  const threadIconAttribute = "data-codex-thread-icon";
  const liveActivitySelector = '[data-codex-live-activity="true"]';
  const contextWidgetSelector = '[data-codex-context-widget="true"]';
  const usageGaugeSelector = '[data-codex-usage-gauge="true"]';
  const usageGaugeModeValues = new Set(["off", "status", "precise"]);
  const contextAccentIds = new Set(["violet", "blue", "green", "amber", "graphite"]);
  const contextAccentChoices = [
    ["violet", "\u7d2b\u7f57\u5170"],
    ["blue", "\u96fe\u84dd"],
    ["green", "\u8367\u5149\u7eff"],
    ["amber", "\u7403\u5f62\u706f\u9ec4"],
    ["graphite", "\u77f3\u58a8\u7070"],
  ];
  const liveActivityAccentIds = new Set(["violet", "blue", "cyan", "green", "amber", "red"]);
  const liveActivityAccentChoices = [
    ["violet", "\u7d2b\u84dd"],
    ["blue", "\u96fe\u84dd"],
    ["cyan", "\u51b0\u9752"],
    ["green", "\u8367\u5149\u7eff"],
    ["amber", "\u7425\u73c0\u6a59"],
    ["red", "\u9ad8\u80fd\u7ea2"],
  ];
  const projectColorIds = new Set([
    "gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple",
  ]);
  const projectColorChoices = [
    ["gray", "\u7070\u8272"],
    ["red", "\u7ea2\u8272"],
    ["orange", "\u6a59\u8272"],
    ["yellow", "\u9ec4\u8272"],
    ["green", "\u7eff\u8272"],
    ["cyan", "\u9752\u8272"],
    ["blue", "\u84dd\u8272"],
    ["purple", "\u7d2b\u8272"],
  ];
  const projectIconIds = new Set([
    "branch", "layers", "database", "chart", "terminal", "code", "book", "tools",
  ]);
  const legacyProjectIconAliases = new Map([
    ["modules", "layers"],
    ["clock", "chart"],
    ["plugin", "tools"],
    ["edit", "code"],
  ]);
  const projectIconChoices = [
    ["branch", "\u5206\u652f"],
    ["layers", "\u5c42\u53e0"],
    ["database", "\u6570\u636e\u5e93"],
    ["chart", "\u8d8b\u52bf"],
    ["terminal", "\u7ec8\u7aef"],
    ["code", "\u4ee3\u7801"],
    ["book", "\u4e66\u7c4d"],
    ["tools", "\u5de5\u5177"],
  ];
  // 发布版移除作者个人项目名种子表；新用户可在外观设置中自行选择。
  const projectColorSeedsByLabel = new Map();
  // 发布版移除作者个人项目名种子表；新用户可在外观设置中自行选择。
  const projectIconSeedsByLabel = new Map();

  const legacySurfaceWasActive =
    root.getAttribute("data-codex-surface-theme") === "gray-white" ||
    (() => {
      try { return localStorage.getItem(legacyStorageKey) === "gray-white"; }
      catch { return false; }
    })();

  globalThis[controllerKey]?.destroy?.();
  if (globalThis[legacyControllerKey] !== globalThis[controllerKey]) {
    globalThis[legacyControllerKey]?.destroy?.();
  }
  delete globalThis[controllerKey];
  delete globalThis[legacyControllerKey];
  globalThis.__codexSkinThemeObserver?.disconnect();
  delete globalThis.__codexSkinThemeObserver;

  for (const legacyId of legacyIds) {
    if (legacyId !== id) document.getElementById(legacyId)?.remove();
  }

  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.setAttribute("data-user-managed", "true");
    (document.head || document.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;

  // The setter functions are created before the VOX canvas manager. During
  // initial hydration this is intentionally a no-op; once the manager is
  // installed the same setters synchronously start or stop canvas rendering.
  let refreshVoxOscilloscopes = () => {};

  const setStoredSelection = (value) => {
    try {
      localStorage.setItem(storageKey, value);
      // Retire the coupled v1 state so a later re-injection cannot revive the
      // old fourth-theme behavior.
      localStorage.setItem(legacyStorageKey, "official");
    } catch {}
  };
  const getStoredSelection = () => {
    try {
      const value = localStorage.getItem(storageKey);
      if (value === activeValue || value === "official") return value;
      const legacyValue = localStorage.getItem(legacyStorageKey);
      const migratedValue = legacyValue === "gray-white"
        ? activeValue
        : legacyValue === "official"
          ? "official"
          : defaultSelection;
      localStorage.setItem(storageKey, migratedValue);
      return migratedValue;
    } catch {
      return defaultSelection;
    }
  };
  const setSurfaceActive = (active, persist = true) => {
    if (active) root.setAttribute("data-codex-surface-layout", activeValue);
    else root.removeAttribute("data-codex-surface-layout");
    root.removeAttribute("data-codex-surface-theme");
    root.removeAttribute("data-codex-user-skin");
    root.removeAttribute("data-codex-wallpaper");
    root.removeAttribute("data-codex-background-mode");
    root.removeAttribute("data-codex-panel-layout");
    root.removeAttribute("data-codex-panel-shadow");
    root.removeAttribute("data-codex-color-glow");
    root.removeAttribute("data-codex-assistant-surface");
    root.removeAttribute("data-codex-user-skin-theme-state");
    if (persist) setStoredSelection(active ? activeValue : "official");
    refreshVoxOscilloscopes();
  };

  const getAssistantIndicator = () => {
    try {
      const value = localStorage.getItem(assistantIndicatorStorageKey);
      return assistantIndicatorValues.has(value) ? value : "rider";
    } catch {
      return "rider";
    }
  };
  const setAssistantIndicator = (value, persist = true) => {
    const nextValue = assistantIndicatorValues.has(value) ? value : "rider";
    root.setAttribute("data-codex-assistant-indicator", nextValue);
    if (persist) {
      try { localStorage.setItem(assistantIndicatorStorageKey, nextValue); } catch {}
    }
    refreshVoxOscilloscopes();
    return nextValue;
  };

  const getAssistantIndicatorEnabled = () => {
    try {
      return localStorage.getItem(assistantIndicatorEnabledStorageKey) !== "false";
    } catch {
      return true;
    }
  };
  const setAssistantIndicatorEnabled = (enabled, persist = true) => {
    const nextValue = Boolean(enabled);
    root.setAttribute("data-codex-assistant-indicator-enabled", nextValue ? "true" : "false");
    if (persist) {
      try { localStorage.setItem(assistantIndicatorEnabledStorageKey, String(nextValue)); } catch {}
    }
    refreshVoxOscilloscopes();
    return nextValue;
  };

  const getOnlineCoreEnabled = () => {
    try {
      const value = localStorage.getItem(onlineCoreEnabledStorageKey);
      if (value === "true" || value === "false") return value === "true";

      // Migrate the old mutually-exclusive placement switch once. "corner"
      // meant the Online Core was visible; "response" meant it was hidden.
      return localStorage.getItem(assistantIndicatorPlacementStorageKey) !== "response";
    } catch {
      return true;
    }
  };
  const setOnlineCoreEnabled = (enabled, persist = true) => {
    const nextValue = Boolean(enabled);
    root.setAttribute("data-codex-online-core-enabled", nextValue ? "true" : "false");

    // Keep the old placement attribute/storage synchronized for compatibility
    // with already-frozen QA tools. It no longer controls the response rail.
    const compatibilityPlacement = nextValue ? "corner" : "response";
    root.setAttribute("data-codex-assistant-indicator-placement", compatibilityPlacement);
    if (persist) {
      try {
        localStorage.setItem(onlineCoreEnabledStorageKey, String(nextValue));
        localStorage.setItem(assistantIndicatorPlacementStorageKey, compatibilityPlacement);
      } catch {}
    }
    refreshVoxOscilloscopes();
    return nextValue;
  };

  const getLiveActivityEnabled = () => {
    const current = root.getAttribute("data-codex-live-activity-enabled");
    if (current === "true" || current === "false") return current === "true";
    try {
      return localStorage.getItem(liveActivityEnabledStorageKey) !== "false";
    } catch {
      return true;
    }
  };
  const setLiveActivityEnabled = (enabled, persist = true) => {
    const nextValue = Boolean(enabled);
    root.setAttribute("data-codex-live-activity-enabled", nextValue ? "true" : "false");
    if (persist) {
      try { localStorage.setItem(liveActivityEnabledStorageKey, String(nextValue)); } catch {}
    }
    return nextValue;
  };

  const getLiveActivityAccent = () => {
    const current = root.getAttribute("data-codex-live-activity-accent");
    if (liveActivityAccentIds.has(current)) return current;
    try {
      const value = localStorage.getItem(liveActivityAccentStorageKey);
      return liveActivityAccentIds.has(value) ? value : "violet";
    } catch {
      return "violet";
    }
  };
  const setLiveActivityAccent = (value, persist = true) => {
    const nextValue = liveActivityAccentIds.has(value) ? value : "violet";
    root.setAttribute("data-codex-live-activity-accent", nextValue);
    if (persist) {
      try { localStorage.setItem(liveActivityAccentStorageKey, nextValue); } catch {}
    }
    return nextValue;
  };

  const getUsageGaugeMode = () => {
    const current = root.getAttribute("data-codex-usage-gauge-mode");
    if (usageGaugeModeValues.has(current)) return current;
    try {
      const value = localStorage.getItem(usageGaugeModeStorageKey);
      return usageGaugeModeValues.has(value) ? value : "status";
    } catch {
      return "status";
    }
  };
  const setUsageGaugeMode = (value, persist = true) => {
    const nextValue = usageGaugeModeValues.has(value) ? value : "status";
    root.setAttribute("data-codex-usage-gauge-mode", nextValue);
    if (persist) {
      try { localStorage.setItem(usageGaugeModeStorageKey, nextValue); } catch {}
    }
    return nextValue;
  };

  const getAssistantIndicatorPlacement = () => {
    return getOnlineCoreEnabled() ? "corner" : "response";
  };
  const setAssistantIndicatorPlacement = (value, persist = true) => {
    const nextValue = assistantIndicatorPlacementValues.has(value) ? value : "corner";
    setOnlineCoreEnabled(nextValue === "corner", persist);
    return nextValue;
  };

  const initialSelection = forceSurface ? activeValue : getStoredSelection();
  setStoredSelection(initialSelection);
  setSurfaceActive(initialSelection === activeValue, false);
  setAssistantIndicator(getAssistantIndicator(), false);
  setAssistantIndicatorEnabled(getAssistantIndicatorEnabled(), false);
  setOnlineCoreEnabled(getOnlineCoreEnabled(), false);
  setLiveActivityEnabled(getLiveActivityEnabled(), false);
  setLiveActivityAccent(getLiveActivityAccent(), false);
  setUsageGaugeMode(getUsageGaugeMode(), false);

  const timers = new Set();
  const schedule = (callback, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };

  let projectColorsNeedSeed = false;
  const readProjectColors = () => {
    try {
      const raw = localStorage.getItem(projectColorStorageKey);
      projectColorsNeedSeed = raw === null;
      if (raw === null) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([projectId, colorId]) => Boolean(projectId) && projectColorIds.has(colorId),
        ),
      );
    } catch {
      projectColorsNeedSeed = true;
      return {};
    }
  };
  let projectColors = readProjectColors();
  const writeProjectColors = () => {
    try {
      localStorage.setItem(projectColorStorageKey, JSON.stringify(projectColors));
    } catch {}
  };
  const seedProjectColors = (rows) => {
    if (!projectColorsNeedSeed || rows.length === 0) return;
    for (const row of rows) {
      const projectId = row.getAttribute("data-app-action-sidebar-project-id");
      const label = row.getAttribute("data-app-action-sidebar-project-label") || "";
      const colorId = projectColorSeedsByLabel.get(label);
      if (projectId && colorId) projectColors[projectId] = colorId;
    }
    projectColorsNeedSeed = false;
    writeProjectColors();
  };
  const readProjectIcons = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(projectIconStorageKey) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).flatMap(([projectId, iconId]) => {
        if (!projectId) return [];
        const normalized = projectIconIds.has(iconId)
          ? iconId
          : legacyProjectIconAliases.get(iconId);
        return normalized ? [[projectId, normalized]] : [];
      }));
    } catch {
      return {};
    }
  };
  let projectIcons = readProjectIcons();
  const writeProjectIcons = () => {
    try {
      localStorage.setItem(projectIconStorageKey, JSON.stringify(projectIcons));
    } catch {}
  };

  let projectColorPopover = null;
  let activeProjectId = null;
  let projectColorObserver = null;
  let projectColorObservedSidebar = null;
  let projectColorRefreshQueued = false;
  let projectIconTemplates = null;
  let threadIconTemplate = null;
  let contextAccentPopover = null;
  let usageGaugePopover = null;
  let statusWidgetRefreshQueued = false;
  let statusWidgetLastRefreshAt = 0;
  let statusWidgetLoopActive = true;
  let conversationStoreCache = null;
  let rateLimitQueryClientCache = null;
  let liveActivityForcedState = null;
  const onlineCoreSelector = '[data-codex-online-core="true"]';
  let onlineCoreActivityObserver = null;
  let onlineCoreObservedBody = null;
  let onlineCoreStateRefreshQueued = false;
  let onlineCoreForcedState = null;
  let startupHydrationObserver = null;
  let startupHydrationRefreshQueued = false;
  let startupHydrationStopped = false;
  const voxCanvasContainerSelector = '[data-codex-vox-canvas-container="true"]';
  const voxCanvasSelector = '[data-codex-vox-canvas="true"]';
  let voxAnimationFrame = 0;
  let voxLastFrameTime = 0;
  let voxTime = 0;
  let voxPulsePhase = 0;
  const voxPaintedCanvases = new WeakSet();
  const voxActiveFrameInterval = 1000 / 30;
  const voxIdleFrameInterval = 1000 / 15;

  const isVoxSurfaceActive = () =>
    root.getAttribute("data-codex-surface-layout") === activeValue &&
    root.getAttribute("data-codex-assistant-indicator") === "vox";
  const isVisibleVoxNode = (node) => {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const nodeStyle = getComputedStyle(node);
    return nodeStyle.display !== "none" && nodeStyle.visibility !== "hidden";
  };
  const findActiveVoxResponseHost = () => {
    const messages = [...document.querySelectorAll(
      '[data-markdown-animated][data-markdown-text-style="assistant-message"]',
    )];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!isVisibleVoxNode(message)) continue;
      const host = message.closest("[data-content-search-unit-key]");
      if (host instanceof HTMLElement) return host;
    }
    return null;
  };
  const findPreTokenVoxHost = () => {
    const stopButton = document.querySelector([
      '[data-composer-surface-variant] button[aria-label="Stop"]',
      '[data-composer-surface-variant] button[aria-label*="\\u505c\\u6b62"]',
    ].join(","));
    if (!stopButton) return null;
    const turns = [...document.querySelectorAll("[data-content-search-turn-key]")];
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn.querySelector(
        '[data-markdown-animated][data-markdown-text-style="assistant-message"]',
      )) continue;
      const shimmer = turn.querySelector(".loading-shimmer-pure-text");
      if (!isVisibleVoxNode(shimmer)) continue;
      const host = turn.firstElementChild;
      if (host instanceof HTMLElement) return host;
    }
    return null;
  };
  const ensureVoxCanvas = (host, locationName) => {
    let container = [...host.children].find(
      (child) => child.matches?.(
        voxCanvasContainerSelector + '[data-codex-vox-location="' + locationName + '"]',
      ),
    );
    if (!container) {
      container = document.createElement("div");
      container.setAttribute("data-codex-vox-canvas-container", "true");
      container.setAttribute("data-codex-vox-location", locationName);
      container.setAttribute("aria-hidden", "true");

      const canvas = document.createElement("canvas");
      canvas.setAttribute("data-codex-vox-canvas", "true");
      canvas.setAttribute("aria-hidden", "true");
      container.appendChild(canvas);
      host.appendChild(container);
    }
    host.setAttribute("data-codex-vox-host", locationName);
    return container;
  };
  const removeVoxCanvasContainer = (container) => {
    const host = container.parentElement;
    container.remove();
    if (host && ![...host.children].some((child) => child.matches?.(voxCanvasContainerSelector))) {
      host.removeAttribute("data-codex-vox-host");
    }
  };
  const drawVoxCanvas = (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const bufferWidth = Math.max(1, Math.round(width * pixelRatio));
    const bufferHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }

    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const waveCenter = width / 2;
    const activeSignal = root.getAttribute("data-codex-online-core-state") === "active";
    const breath = (Math.sin(voxPulsePhase) + 1) / 2;
    const signalEnergy = activeSignal
      ? 0.9 + breath * 0.1
      : 0.16 + breath * 0.08;
    const signalOpacity = activeSignal ? 1 : 0.44;
    const envelopeDenominator = Math.max(220, width * width * 0.0065);
    const lightMode = root.classList.contains("electron-light") &&
      !root.classList.contains("electron-dark") &&
      !root.classList.contains("dark");
    const baselineColor = lightMode
      ? "rgba(91, 33, 182, 0.24)"
      : "rgba(192, 132, 252, 0.2)";
    const coreColor = lightMode ? "#5b21b6" : "#ffffff";
    const glowColor = lightMode ? "#8b5cf6" : "#c084fc";
    const voxLocation = canvas.parentElement?.getAttribute("data-codex-vox-location") || "";

    // A dim physical zero line remains visible across the OLED. It is painted
    // only in the always-on sidebar slot. In the main response surface that
    // baseline reads as a second purple strip beneath the waveform.
    if (voxLocation === "online") {
      context.beginPath();
      context.lineWidth = 0.8;
      context.strokeStyle = baselineColor;
      context.globalAlpha = activeSignal ? 1 : 0.34;
      context.shadowBlur = 0;
      context.moveTo(0, centerY);
      context.lineTo(width, centerY);
      context.stroke();
    }

    context.beginPath();
    context.lineWidth = activeSignal ? 1.2 : 1.1;
    context.strokeStyle = coreColor;
    context.shadowColor = glowColor;
    context.shadowBlur = activeSignal ? 4.5 : 1.8;
    context.globalAlpha = signalOpacity;
    let signalOpen = false;
    for (let x = 0; x <= width; x += 1) {
      const distance = x - waveCenter;
      const envelope = Math.exp(-(distance * distance) / envelopeDenominator);
      if (envelope <= 0.002) {
        signalOpen = false;
        continue;
      }
      const fundamental = Math.sin(distance * 0.32 - voxTime * 6) * (activeSignal ? 8 : 7.5);
      const harmonic = Math.sin(distance * 0.78 + voxTime * 10) * (activeSignal ? 3.8 : 3.5);
      // A low-amplitude smooth upper harmonic adds live electrical movement
      // without turning the accepted plasma filament into a jagged polyline.
      const transient = activeSignal
        ? Math.sin(distance * 1.18 - voxTime * 14) * 0.85
        : 0;
      const microJitter = (Math.random() - 0.5) * 1.5;
      const y = centerY +
        (fundamental + harmonic + transient + microJitter) * envelope * signalEnergy;
      if (!signalOpen) {
        context.moveTo(x, y);
        signalOpen = true;
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
    if (activeSignal) {
      // Repaint only a sub-pixel white-hot core with no blur. This increases
      // perceived brightness while preserving the crisp CRT/VOX material.
      context.lineWidth = 0.8;
      context.strokeStyle = coreColor;
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.stroke();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
  };
  const stopVoxAnimation = () => {
    if (voxAnimationFrame) cancelAnimationFrame(voxAnimationFrame);
    voxAnimationFrame = 0;
    voxLastFrameTime = 0;
    root.removeAttribute("data-codex-vox-running");
  };
  const renderVoxOscilloscopes = (frameTime = performance.now()) => {
    voxAnimationFrame = 0;
    if (!isVoxSurfaceActive()) {
      stopVoxAnimation();
      return;
    }
    const activeSignal = root.getAttribute("data-codex-online-core-state") === "active";
    const frameInterval = activeSignal ? voxActiveFrameInterval : voxIdleFrameInterval;
    const elapsed = voxLastFrameTime ? frameTime - voxLastFrameTime : frameInterval;
    if (voxLastFrameTime && elapsed + 0.75 < frameInterval) {
      voxAnimationFrame = requestAnimationFrame(renderVoxOscilloscopes);
      return;
    }
    const canvases = [...document.querySelectorAll(voxCanvasSelector)].filter(isVisibleVoxNode);
    if (canvases.length === 0) {
      stopVoxAnimation();
      return;
    }
    const activityScale = activeSignal ? 1 : 0.32;
    const elapsedFrameScale = Math.min(6, Math.max(1, elapsed / (1000 / 60)));
    voxLastFrameTime = frameTime;
    voxTime += 0.15 * activityScale * elapsedFrameScale;
    voxPulsePhase += 0.025 * activityScale * elapsedFrameScale;
    for (const canvas of canvases) {
      drawVoxCanvas(canvas);
      voxPaintedCanvases.add(canvas);
    }
    voxAnimationFrame = requestAnimationFrame(renderVoxOscilloscopes);
  };
  const startVoxAnimation = () => {
    if (voxAnimationFrame) return;
    root.setAttribute("data-codex-vox-running", "true");
    voxAnimationFrame = requestAnimationFrame(renderVoxOscilloscopes);
  };
  refreshVoxOscilloscopes = () => {
    const keep = new Set();
    if (isVoxSurfaceActive()) {
      if (root.getAttribute("data-codex-online-core-enabled") !== "false") {
        const onlineCore = document.querySelector(onlineCoreSelector);
        if (onlineCore instanceof HTMLElement) {
          keep.add(ensureVoxCanvas(onlineCore, "online"));
        }
      }
      if (root.getAttribute("data-codex-assistant-indicator-enabled") !== "false") {
        const responseHost = findActiveVoxResponseHost();
        if (responseHost) {
          keep.add(ensureVoxCanvas(responseHost, "response"));
        } else {
          const preTokenHost = findPreTokenVoxHost();
          if (preTokenHost) keep.add(ensureVoxCanvas(preTokenHost, "pretoken"));
        }
      }
    }
    for (const container of document.querySelectorAll(voxCanvasContainerSelector)) {
      if (!keep.has(container)) removeVoxCanvasContainer(container);
    }
    // Paint only newly mounted canvases immediately. The activity observer can
    // fire many times while a response streams; repainting every existing
    // canvas from that observer would bypass the shared frame-rate governor.
    for (const container of keep) {
      const canvas = container.querySelector(voxCanvasSelector);
      if (canvas && !voxPaintedCanvases.has(canvas)) {
        drawVoxCanvas(canvas);
        voxPaintedCanvases.add(canvas);
      }
    }
    if (keep.size > 0) startVoxAnimation();
    else stopVoxAnimation();
    return keep.size;
  };
  const destroyVoxOscilloscopes = () => {
    stopVoxAnimation();
    for (const container of document.querySelectorAll(voxCanvasContainerSelector)) {
      removeVoxCanvasContainer(container);
    }
  };

  const closeProjectColorPopover = () => {
    if (projectColorPopover) projectColorPopover.hidden = true;
    activeProjectId = null;
  };
  const setProjectColorById = (projectId, colorId) => {
    if (!projectId) return;
    if (projectColorIds.has(colorId)) projectColors[projectId] = colorId;
    else delete projectColors[projectId];
    writeProjectColors();
    applyProjectColors();
  };
  const setProjectIconById = (projectId, iconId) => {
    if (!projectId) return;
    if (projectIconIds.has(iconId)) projectIcons[projectId] = iconId;
    else delete projectIcons[projectId];
    writeProjectIcons();
    applyProjectColors();
  };
  const syncProjectColorPopover = () => {
    if (!projectColorPopover) return;
    const selectedColor = activeProjectId ? projectColors[activeProjectId] : null;
    for (const button of projectColorPopover.querySelectorAll("[data-codex-project-color-swatch]")) {
      const selected = button.getAttribute("data-codex-project-color-swatch") === selectedColor;
      button.toggleAttribute("data-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    const activeRow = activeProjectId
      ? [...document.querySelectorAll(projectRowSelector)].find(
        (row) => row.getAttribute("data-app-action-sidebar-project-id") === activeProjectId,
      )
      : null;
    const selectedIcon = activeRow ? projectIconVariantForRow(activeRow) : null;
    for (const button of projectColorPopover.querySelectorAll("[data-codex-project-icon-swatch]")) {
      const selected = button.getAttribute("data-codex-project-icon-swatch") === selectedIcon;
      button.toggleAttribute("data-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  };
  const ensureProjectColorPopover = () => {
    if (projectColorPopover?.isConnected) return projectColorPopover;
    const popover = document.createElement("div");
    popover.setAttribute("data-codex-project-color-popover", "true");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "\u9879\u76ee\u6837\u5f0f");
    popover.hidden = true;

    const title = document.createElement("div");
    title.setAttribute("data-codex-project-color-title", "true");
    title.textContent = "\u9879\u76ee\u6837\u5f0f";
    const name = document.createElement("div");
    name.setAttribute("data-codex-project-color-name", "true");

    const iconLabel = document.createElement("div");
    iconLabel.setAttribute("data-codex-project-style-label", "true");
    iconLabel.textContent = "\u56fe\u6807";
    const iconGrid = document.createElement("div");
    iconGrid.setAttribute("data-codex-project-icon-grid", "true");
    const templates = buildProjectIconTemplates();
    for (const [iconId, label] of projectIconChoices) {
      const template = templates?.[iconId];
      if (!(template instanceof SVGElement)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-codex-project-icon-swatch", iconId);
      button.setAttribute("aria-label", label);
      button.title = label;
      const icon = template.cloneNode(true);
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
      button.appendChild(icon);
      button.addEventListener("click", () => {
        setProjectIconById(activeProjectId, iconId);
        closeProjectColorPopover();
      });
      iconGrid.appendChild(button);
    }

    const colorLabel = document.createElement("div");
    colorLabel.setAttribute("data-codex-project-style-label", "true");
    colorLabel.textContent = "\u989c\u8272";

    const grid = document.createElement("div");
    grid.setAttribute("data-codex-project-color-grid", "true");
    for (const [colorId, label] of projectColorChoices) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-codex-project-color-swatch", colorId);
      button.setAttribute("aria-label", label);
      button.title = label;
      button.style.setProperty("--codex-project-swatch", "var(--codex-project-color-" + colorId + ")");
      button.addEventListener("click", () => {
        setProjectColorById(activeProjectId, colorId);
        closeProjectColorPopover();
      });
      grid.appendChild(button);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.setAttribute("data-codex-project-color-reset", "true");
    reset.textContent = "\u6062\u590d\u9879\u76ee\u9ed8\u8ba4";
    reset.addEventListener("click", () => {
      setProjectColorById(activeProjectId, null);
      setProjectIconById(activeProjectId, null);
      closeProjectColorPopover();
    });

    popover.append(title, name, iconLabel, iconGrid, colorLabel, grid, reset);
    document.body.appendChild(popover);
    projectColorPopover = popover;
    return popover;
  };
  const openProjectColorPopover = (row, clientX, clientY) => {
    const projectId = row.getAttribute("data-app-action-sidebar-project-id");
    if (!projectId) return;
    activeProjectId = projectId;
    const popover = ensureProjectColorPopover();
    const name = popover.querySelector("[data-codex-project-color-name]");
    if (name) {
      name.textContent = row.getAttribute("data-app-action-sidebar-project-label") || row.getAttribute("aria-label") || "";
    }
    syncProjectColorPopover();
    popover.hidden = false;
    popover.style.visibility = "hidden";
    popover.style.left = "0px";
    popover.style.top = "0px";
    const rect = popover.getBoundingClientRect();
    const viewportMargin = 8;
    const cursorGap = 8;
    let left = clientX + cursorGap;
    let top = clientY + cursorGap;
    if (left + rect.width > window.innerWidth - viewportMargin) {
      left = clientX - rect.width - cursorGap;
    }
    if (top + rect.height > window.innerHeight - viewportMargin) {
      top = clientY - rect.height - cursorGap;
    }
    left = Math.max(viewportMargin, Math.min(left, window.innerWidth - rect.width - viewportMargin));
    top = Math.max(viewportMargin, Math.min(top, window.innerHeight - rect.height - viewportMargin));
    popover.style.left = left + "px";
    popover.style.top = top + "px";
    popover.style.visibility = "";
  };
  const buildProjectIconTemplates = () => {
    if (projectIconTemplates) return projectIconTemplates;
    const parser = new DOMParser();
    const templates = {};
    for (const iconId of projectIconIds) {
      const markup = projectIconMarkup[iconId];
      if (typeof markup !== "string") return null;
      const documentNode = parser.parseFromString(markup, "image/svg+xml");
      const icon = documentNode.documentElement;
      if (icon?.localName !== "svg" || documentNode.querySelector("parsererror")) return null;
      templates[iconId] = document.importNode(icon, true);
    }
    projectIconTemplates = templates;
    return projectIconTemplates;
  };
  const projectIconVariantForRow = (row) => {
    const projectId = row.getAttribute("data-app-action-sidebar-project-id");
    const saved = projectId ? projectIcons[projectId] : null;
    if (projectIconIds.has(saved)) return saved;
    const label = row.getAttribute("data-app-action-sidebar-project-label") || "";
    return projectIconSeedsByLabel.get(label) || "branch";
  };
  const mountProjectIcons = () => {
    const templates = buildProjectIconTemplates();
    if (!templates) return 0;
    let mounted = 0;
    for (const row of document.querySelectorAll(projectRowSelector)) {
      const variant = projectIconVariantForRow(row);
      const slot = row.querySelector('[data-sidebar-project-drop-zone="project-icon"]');
      if (!(slot instanceof Element)) continue;
      let icon = slot.querySelector("[" + projectIconAttribute + "]");
      if (icon && icon.getAttribute(projectIconAttribute) !== variant) {
        icon.remove();
        icon = null;
      }
      if (!icon) {
        icon = templates[variant].cloneNode(true);
        icon.setAttribute(projectIconAttribute, variant);
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("focusable", "false");
        icon.setAttribute("width", "19");
        icon.setAttribute("height", "19");
        icon.setAttribute("class", "icon-xs");
        slot.appendChild(icon);
      }
      mounted += 1;
    }
    return mounted;
  };
  const buildThreadIconTemplate = () => {
    if (threadIconTemplate) return threadIconTemplate;

    // Prefer Codex's own comment balloon: its tail remains legible at sidebar
    // size, unlike the almost-circular quick-chat outline. If that action is
    // not mounted yet, fall back to the always-available quick-chat glyph.
    const commentPathPrefix = "M9.9994 2.43188";
    const commentSource = [...document.querySelectorAll("svg")].find((candidate) =>
      [...candidate.querySelectorAll("path")].some((path) =>
        (path.getAttribute("d") || "").startsWith(commentPathPrefix),
      ),
    );
    const quickChatSource = document.querySelector('[aria-label="\u5feb\u901f\u804a\u5929"] svg');
    const source = commentSource || quickChatSource;
    if (!(source instanceof SVGElement)) return null;
    const icon = source.cloneNode(true);
    const paths = [...icon.querySelectorAll("path")];
    if (commentSource) {
      for (const path of paths) {
        if (!(path.getAttribute("d") || "").startsWith(commentPathPrefix)) path.remove();
      }
    } else if (paths.length > 1) {
      paths[paths.length - 1].remove();
    }
    icon.setAttribute(threadIconAttribute, "true");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("class", "icon-xs");
    threadIconTemplate = icon;
    return threadIconTemplate;
  };
  const mountThreadIcons = () => {
    const template = buildThreadIconTemplate();
    if (!template) return 0;
    let mounted = 0;
    for (const row of document.querySelectorAll(threadRowSelector)) {
      if (row.querySelector("[" + threadIconAttribute + "]")) {
        mounted += 1;
        continue;
      }
      const title = row.querySelector('[data-thread-title-trigger="true"]');
      const leadingSlot = title?.parentElement?.firstElementChild;
      const host = leadingSlot?.firstElementChild || leadingSlot;
      if (!(host instanceof Element) || host.querySelector("svg")) continue;
      host.appendChild(template.cloneNode(true));
      mounted += 1;
    }
    return mounted;
  };
  const applyProjectColors = () => {
    const rows = [...document.querySelectorAll(projectRowSelector)];
    seedProjectColors(rows);
    for (const row of rows) {
      const projectId = row.getAttribute("data-app-action-sidebar-project-id");
      const colorId = projectId ? projectColors[projectId] : null;
      const projectCard = row.closest('[data-sidebar-project-kind="local"][role="listitem"]');
      const gridItem = projectCard?.parentElement?.parentElement;
      const projectGrid = gridItem?.parentElement;
      const expanded = row.getAttribute("aria-expanded") === "true";
      const colorTargets = [row, projectCard, gridItem].filter(Boolean);

      if (projectCard && gridItem && projectGrid?.getAttribute("role") === "list") {
        projectGrid.setAttribute(projectGridAttribute, "true");
        gridItem.setAttribute(projectGridItemAttribute, "true");
        gridItem.setAttribute(projectExpandedAttribute, expanded ? "true" : "false");
        projectCard.setAttribute(projectCardAttribute, "true");
        projectCard.setAttribute(projectExpandedAttribute, expanded ? "true" : "false");
      }

      for (const target of colorTargets) {
        if (projectColorIds.has(colorId)) target.setAttribute(projectColorAttribute, colorId);
        else target.removeAttribute(projectColorAttribute);
      }
    }
    mountProjectIcons();
    mountThreadIcons();
    if (activeProjectId && !rows.some(
      (row) => row.getAttribute("data-app-action-sidebar-project-id") === activeProjectId,
    )) {
      closeProjectColorPopover();
    }
  };
  const queueProjectColorRefresh = () => {
    if (projectColorRefreshQueued) return;
    projectColorRefreshQueued = true;
    schedule(() => {
      projectColorRefreshQueued = false;
      applyProjectColors();
      mountOnlineCore();
      refreshStatusWidgets();
    }, 24);
  };
  const ensureProjectColorObserver = () => {
    const sidebar = document.querySelector(".app-shell-left-panel");
    if (!sidebar || sidebar === projectColorObservedSidebar) return;
    projectColorObserver?.disconnect();
    projectColorObservedSidebar = sidebar;
    projectColorObserver = new MutationObserver(queueProjectColorRefresh);
    projectColorObserver.observe(sidebar, { childList: true, subtree: true });
  };
  const mountProjectColors = () => {
    applyProjectColors();
    ensureProjectColorObserver();
    return document.querySelectorAll(projectRowSelector + "[" + projectColorAttribute + "]").length;
  };

  const onlineCoreActivitySelector = [
    ".loading-shimmer-pure-text",
    '[data-markdown-animated][data-markdown-text-style="assistant-message"]',
    '[data-composer-surface-variant] button[aria-label*="Stop"]',
    '[data-composer-surface-variant] button[aria-label*="\u505c\u6b62"]',
  ].join(",");
  const hasVisibleOnlineCoreActivity = () => [...document.querySelectorAll(onlineCoreActivitySelector)]
    .some((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  const refreshOnlineCoreState = () => {
    const nextState = onlineCoreForcedState || (hasVisibleOnlineCoreActivity() ? "active" : "idle");
    root.setAttribute("data-codex-online-core-state", nextState);
    document.querySelector(onlineCoreSelector)?.setAttribute("data-online-state", nextState);
    return nextState;
  };
  const queueOnlineCoreStateRefresh = () => {
    if (onlineCoreStateRefreshQueued) return;
    onlineCoreStateRefreshQueued = true;
    schedule(() => {
      onlineCoreStateRefreshQueued = false;
      reconcileDynamicShell();
      refreshOnlineCoreState();
      refreshVoxOscilloscopes();
      queueStatusWidgetRefresh();
    }, 32);
  };
  const ensureOnlineCoreActivityObserver = () => {
    if (!document.body || document.body === onlineCoreObservedBody) return;
    onlineCoreActivityObserver?.disconnect();
    onlineCoreObservedBody = document.body;
    onlineCoreActivityObserver = new MutationObserver(queueOnlineCoreStateRefresh);
    onlineCoreActivityObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-markdown-animated"],
    });
  };
  const findSidebarTopRow = () => {
    const sidebar = document.querySelector(".app-shell-left-panel");
    if (!sidebar) return null;
    const codexLabel = [...sidebar.querySelectorAll("span")].find(
      (node) => node.children.length === 0 && node.textContent?.trim() === "Codex",
    );
    const modeButton = codexLabel?.closest("button");
    const row = modeButton?.parentElement;
    if (!modeButton || !row || !sidebar.contains(row)) return null;
    return { sidebar, row, modeButton };
  };
  const mountOnlineCore = () => {
    const target = findSidebarTopRow();
    if (!target) return false;
    let core = document.querySelector(onlineCoreSelector);
    if (!core) {
      core = document.createElement("div");
      core.setAttribute("data-codex-online-core", "true");
      core.setAttribute("aria-hidden", "true");

      const rail = document.createElement("span");
      rail.setAttribute("data-codex-online-core-rail", "true");
      const runner = document.createElement("span");
      runner.setAttribute("data-codex-online-core-mark", "true");
      core.append(rail, runner);
    }

    if (core.parentElement !== target.row || core.previousElementSibling !== target.modeButton) {
      target.modeButton.insertAdjacentElement("afterend", core);
    }
    ensureOnlineCoreActivityObserver();
    refreshOnlineCoreState();
    refreshVoxOscilloscopes();
    return true;
  };
  const reconcileDynamicShell = () => {
    const sidebar = document.querySelector(".app-shell-left-panel");
    if (sidebar && sidebar !== projectColorObservedSidebar) mountProjectColors();
    if (
      document.body &&
      (document.body !== onlineCoreObservedBody || !document.querySelector(onlineCoreSelector))
    ) mountOnlineCore();
  };
  const setOnlineCoreState = (value = "auto") => {
    onlineCoreForcedState = value === "active" || value === "idle" ? value : null;
    const nextState = refreshOnlineCoreState();
    refreshVoxOscilloscopes();
    return nextState;
  };

  const getContextAccent = () => {
    try {
      const value = localStorage.getItem(contextAccentStorageKey);
      return contextAccentIds.has(value) ? value : "violet";
    } catch {
      return "violet";
    }
  };
  const syncContextAccentPopover = (selected = getContextAccent()) => {
    setNodeAttribute(root, "data-codex-context-accent", selected);
    for (const button of contextAccentPopover?.querySelectorAll(
      "[data-codex-context-accent-swatch]",
    ) || []) {
      const isSelected = button.getAttribute("data-codex-context-accent-swatch") === selected;
      toggleNodeAttribute(button, "data-selected", isSelected);
      setNodeAttribute(button, "aria-checked", isSelected ? "true" : "false");
    }
    return selected;
  };
  const setContextAccent = (value, persist = true) => {
    const nextValue = contextAccentIds.has(value) ? value : "violet";
    setNodeAttribute(root, "data-codex-context-accent", nextValue);
    if (persist) {
      try { localStorage.setItem(contextAccentStorageKey, nextValue); } catch {}
    }
    syncContextAccentPopover(nextValue);
    return nextValue;
  };

  const setNodeText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  const setNodeAttribute = (node, name, value) => {
    const nextValue = String(value);
    if (node && node.getAttribute(name) !== nextValue) node.setAttribute(name, nextValue);
  };
  const removeNodeAttribute = (node, name) => {
    if (node?.hasAttribute(name)) node.removeAttribute(name);
  };
  const toggleNodeAttribute = (node, name, force) => {
    const nextValue = Boolean(force);
    if (node && node.hasAttribute(name) !== nextValue) node.toggleAttribute(name, nextValue);
  };
  const formatTokenCount = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "\u2014";
    if (number >= 1_000_000) return (number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1) + "m";
    if (number >= 1_000) return (number / 1_000).toFixed(number >= 100_000 ? 0 : 1) + "k";
    return String(Math.round(number));
  };
  const getActiveConversationId = () => {
    const row = document.querySelector(
      threadRowSelector + '[data-app-action-sidebar-thread-active="true"], ' +
      threadRowSelector + '[data-app-action-sidebar-thread-selected="true"]',
    );
    const rawId = row?.getAttribute("data-app-action-sidebar-thread-id") || "";
    const hostId = row?.getAttribute("data-app-action-sidebar-thread-host-id") || "";
    if (rawId) {
      const prefix = hostId ? hostId + ":" : "";
      return prefix && rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId.replace(/^[^:]+:/, "");
    }
    return document.querySelector("[data-response-annotation-conversation]")
      ?.getAttribute("data-response-annotation-conversation") || null;
  };
  const findConversationStore = () => {
    if (conversationStoreCache?.conversations instanceof Map) {
      return conversationStoreCache;
    }
    const anchor =
      document.querySelector("[data-content-search-unit-key]") ||
      document.querySelector(".app-shell-left-panel") ||
      document.getElementById("root");
    if (!anchor) return null;
    const fiberKey = Object.keys(anchor).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
    );
    const containerKey = Object.keys(anchor).find((key) => key.startsWith("__reactContainer$"));
    let fiber = fiberKey ? anchor[fiberKey] : containerKey ? anchor[containerKey]?.current : null;
    while (fiber?.return) fiber = fiber.return;
    const stack = fiber ? [fiber] : [];
    let visited = 0;
    while (stack.length && visited < 12000) {
      const current = stack.pop();
      visited += 1;
      let hook = current.memoizedState;
      for (let index = 0; hook && index < 48; index += 1, hook = hook.next) {
        const state = hook.memoizedState;
        const candidates = [state, state?.value, state?.store, state?.threadStore];
        for (const candidate of candidates) {
          if (candidate?.conversations instanceof Map) {
            conversationStoreCache = candidate;
            return candidate;
          }
        }
      }
      if (current.child) stack.push(current.child);
      if (current.sibling) stack.push(current.sibling);
    }
    return null;
  };
  const getCurrentContextUsage = () => {
    const conversationId = getActiveConversationId();
    const store = findConversationStore();
    const conversation = conversationId && store?.conversations instanceof Map
      ? store.conversations.get(conversationId)
      : null;
    const usage = conversation?.latestTokenUsageInfo;
    const usedTokens = Number(usage?.last?.totalTokens);
    const contextWindow = Number(usage?.modelContextWindow);
    if (!Number.isFinite(usedTokens) || !Number.isFinite(contextWindow) || contextWindow <= 0) {
      return { conversationId, available: false };
    }
    return {
      conversationId,
      available: true,
      usedTokens,
      contextWindow,
      percentage: Math.max(0, Math.min(100, (usedTokens / contextWindow) * 100)),
    };
  };

  const closeContextAccentPopover = () => {
    if (contextAccentPopover) contextAccentPopover.hidden = true;
  };
  const ensureContextAccentPopover = () => {
    if (contextAccentPopover?.isConnected) return contextAccentPopover;
    const popover = document.createElement("div");
    popover.setAttribute("data-codex-context-accent-popover", "true");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "\u4e0a\u4e0b\u6587\u4eea\u8868\u989c\u8272");
    popover.hidden = true;
    const label = document.createElement("div");
    label.setAttribute("data-codex-context-accent-title", "true");
    label.textContent = "\u4e0a\u4e0b\u6587\u989c\u8272";
    const grid = document.createElement("div");
    grid.setAttribute("data-codex-context-accent-grid", "true");
    grid.setAttribute("role", "radiogroup");
    for (const [value, text] of contextAccentChoices) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-label", text);
      button.setAttribute("title", text);
      button.setAttribute("data-codex-context-accent-swatch", value);
      button.addEventListener("click", () => {
        setContextAccent(value, true);
        closeContextAccentPopover();
      });
      grid.appendChild(button);
    }
    popover.append(label, grid);
    document.body.appendChild(popover);
    contextAccentPopover = popover;
    syncContextAccentPopover();
    return popover;
  };
  const openContextAccentPopover = (anchor) => {
    const popover = ensureContextAccentPopover();
    const wasOpen = !popover.hidden;
    if (wasOpen) {
      closeContextAccentPopover();
      return;
    }
    popover.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - popoverRect.width - 8, anchorRect.right - popoverRect.width));
    const preferredTop = anchorRect.top - popoverRect.height - 8;
    const top = preferredTop >= 8 ? preferredTop : Math.min(window.innerHeight - popoverRect.height - 8, anchorRect.bottom + 8);
    popover.style.left = Math.round(left) + "px";
    popover.style.top = Math.round(top) + "px";
  };

  const findComposerContextWidget = () => {
    const composer = document.querySelector("[data-composer-surface-variant]");
    if (!composer) return null;
    const indicator = [...composer.querySelectorAll('[role="img"][aria-label]')].find((node) =>
      /(?:\u4e0a\u4e0b\u6587|context).*(?:%|\u7528\u91cf|usage)/i.test(node.getAttribute("aria-label") || ""),
    );
    if (!indicator) return null;
    const wrapper = indicator.parentElement;
    return wrapper && composer.contains(wrapper) ? wrapper : indicator;
  };
  const cleanupContextWidget = (widget) => {
    if (!(widget instanceof Element)) return;
    const handlers = widget.__codexContextHandlers;
    if (handlers) {
      widget.removeEventListener("click", handlers.click);
      widget.removeEventListener("keydown", handlers.keydown);
      delete widget.__codexContextHandlers;
    }
    widget.removeAttribute("data-codex-context-widget");
    widget.removeAttribute("role");
    widget.removeAttribute("tabindex");
    widget.removeAttribute("aria-haspopup");
    widget.removeAttribute("title");
  };
  const mountContextWidget = () => {
    const nativeWidget = findComposerContextWidget();
    for (const widget of document.querySelectorAll(contextWidgetSelector)) {
      if (widget !== nativeWidget) cleanupContextWidget(widget);
    }
    if (!nativeWidget) return null;
    setNodeAttribute(nativeWidget, "data-codex-context-widget", "true");
    setNodeAttribute(nativeWidget, "role", "button");
    setNodeAttribute(nativeWidget, "tabindex", "0");
    setNodeAttribute(nativeWidget, "aria-haspopup", "dialog");
    if (!nativeWidget.__codexContextHandlers) {
      const click = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openContextAccentPopover(nativeWidget);
      };
      const keydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openContextAccentPopover(nativeWidget);
      };
      nativeWidget.addEventListener("click", click);
      nativeWidget.addEventListener("keydown", keydown);
      nativeWidget.__codexContextHandlers = { click, keydown };
    }
    syncContextAccentPopover();
    return nativeWidget;
  };
  const refreshContextWidget = () => {
    const widget = mountContextWidget();
    if (!widget) {
      setNodeAttribute(root, "data-codex-context-source", "unavailable");
      removeNodeAttribute(root, "data-codex-context-percent");
      return false;
    }
    const nativeLabel = widget.querySelector('[aria-label*="%"]')?.getAttribute("aria-label") || "";
    const nativeMatch = nativeLabel.match(/(\\d+(?:\\.\\d+)?)\\s*%/);
    const usage = getCurrentContextUsage();
    const nativePercentage = nativeMatch ? Number(nativeMatch[1]) : NaN;
    const percentage = Number.isFinite(nativePercentage)
      ? Math.max(0, Math.min(100, Math.round(nativePercentage)))
      : usage.available
        ? Math.round(usage.percentage)
        : null;
    if (percentage === null) {
      const details = "\u5f53\u524d\u4efb\u52a1\u5c1a\u65e0\u53ef\u7528\u7684\u4e0a\u4e0b\u6587\u7528\u91cf\uff08\u70b9\u51fb\u6362\u8272\uff09";
      setNodeAttribute(widget, "title", details);
      setNodeAttribute(widget, "aria-label", details);
      setNodeAttribute(root, "data-codex-context-source", "unavailable");
      removeNodeAttribute(root, "data-codex-context-percent");
      return true;
    }
    const tokenDetails = usage.available
      ? " \u00b7 " + formatTokenCount(usage.usedTokens) + " / " + formatTokenCount(usage.contextWindow) + " tokens"
      : "";
    const details = "\u4e0a\u4e0b\u6587\u5df2\u7528 " + percentage + "%" + tokenDetails;
    setNodeAttribute(widget, "title", details + "\uff08\u70b9\u51fb\u6362\u8272\uff09");
    setNodeAttribute(widget, "aria-label", details + "\uff0c\u70b9\u51fb\u9009\u62e9\u4eea\u8868\u989c\u8272");
    setNodeAttribute(root, "data-codex-context-source", Number.isFinite(nativePercentage)
      ? "composer-native-context"
      : "thread-token-usage");
    setNodeAttribute(root, "data-codex-context-percent", String(percentage));
    return true;
  };

  const findRateLimitQueryClient = () => {
    if (
      rateLimitQueryClientCache &&
      typeof rateLimitQueryClientCache.getQueryCache === "function" &&
      typeof rateLimitQueryClientCache.getQueryData === "function"
    ) {
      return rateLimitQueryClientCache;
    }
    const anchor =
      document.querySelector(".app-shell-left-panel") ||
      document.querySelector("[data-content-search-unit-key]") ||
      document.getElementById("root");
    if (!anchor) return null;
    const fiberKey = Object.keys(anchor).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
    );
    const containerKey = Object.keys(anchor).find((key) => key.startsWith("__reactContainer$"));
    let fiber = fiberKey ? anchor[fiberKey] : containerKey ? anchor[containerKey]?.current : null;
    while (fiber?.return) fiber = fiber.return;
    const stack = fiber ? [fiber] : [];
    let visited = 0;
    while (stack.length && visited < 14000) {
      const current = stack.pop();
      visited += 1;
      let hook = current.memoizedState;
      for (let index = 0; hook && index < 80; index += 1, hook = hook.next) {
        const state = hook.memoizedState;
        const candidates = [state, state?.value, state?.client, state?.queryClient];
        for (const candidate of candidates) {
          if (
            candidate &&
            typeof candidate.getQueryCache === "function" &&
            typeof candidate.getQueryData === "function"
          ) {
            rateLimitQueryClientCache = candidate;
            return candidate;
          }
        }
      }
      if (current.child) stack.push(current.child);
      if (current.sibling) stack.push(current.sibling);
    }
    return null;
  };
  const normalizeRateLimitBucket = (bucket) => {
    if (!bucket || typeof bucket !== "object") return null;
    const usedPercent = Number(bucket.used_percent ?? bucket.usedPercent);
    const durationSeconds = Number(
      bucket.limit_window_seconds ??
      bucket.window_duration_seconds ??
      (Number.isFinite(Number(bucket.windowDurationMins)) ? Number(bucket.windowDurationMins) * 60 : NaN),
    );
    const resetValue = Number(bucket.reset_at ?? bucket.resetsAt);
    if (!Number.isFinite(usedPercent) || !Number.isFinite(durationSeconds) || !Number.isFinite(resetValue)) {
      return null;
    }
    const durationMins = Math.max(1, Math.round(durationSeconds / 60));
    const remainingPercent = Math.max(0, Math.min(100, Math.round(100 - usedPercent)));
    const resetAt = resetValue < 10_000_000_000 ? resetValue * 1000 : resetValue;
    const label = durationMins === 300
      ? "5 小时"
      : durationMins === 10080
        ? "1 周"
        : durationMins % 1440 === 0
          ? String(Math.round(durationMins / 1440)) + " 天"
          : durationMins % 60 === 0
            ? String(Math.round(durationMins / 60)) + " 小时"
            : String(durationMins) + " 分钟";
    return { usedPercent, remainingPercent, durationMins, resetAt, label };
  };
  const getCurrentRateLimitStatus = () => {
    const client = findRateLimitQueryClient();
    if (!client) return { available: false, source: "unavailable" };
    let data = null;
    let updatedAt = 0;
    try {
      data = client.getQueryData(["rate-limit-status"]);
      const query = client.getQueryCache().getAll().find(
        (candidate) => candidate?.queryHash === '["rate-limit-status"]' ||
          candidate?.queryKey?.[0] === "rate-limit-status",
      );
      if (!data) data = query?.state?.data || null;
      updatedAt = Number(query?.state?.dataUpdatedAt || 0);
    } catch {}
    const limit = data?.rate_limit ?? data?.rateLimit;
    const buckets = [
      limit?.primary_window ?? limit?.primaryWindow ?? limit?.primary,
      limit?.secondary_window ?? limit?.secondaryWindow ?? limit?.secondary,
    ].map(normalizeRateLimitBucket).filter(Boolean);
    if (buckets.length === 0) {
      return { available: false, source: "rate-limit-query-cache", updatedAt };
    }
    const limitingBucket = buckets.reduce(
      (lowest, bucket) => bucket.remainingPercent < lowest.remainingPercent ? bucket : lowest,
      buckets[0],
    );
    const level = limitingBucket.remainingPercent <= 20
      ? "critical"
      : limitingBucket.remainingPercent <= 40
        ? "caution"
        : "normal";
    return {
      available: true,
      source: "rate-limit-query-cache",
      planType: String(data?.plan_type ?? data?.planType ?? "unknown"),
      buckets,
      limitingBucket,
      level,
      updatedAt,
    };
  };
  const formatUsageReset = (bucket) => {
    if (!bucket || !Number.isFinite(bucket.resetAt)) return "—";
    const date = new Date(bucket.resetAt);
    if (Number.isNaN(date.getTime())) return "—";
    const options = bucket.durationMins <= 1440
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "numeric", day: "numeric" };
    try { return new Intl.DateTimeFormat("zh-CN", options).format(date); }
    catch { return date.toLocaleString(); }
  };
  const closeUsageGaugePopover = () => {
    if (usageGaugePopover) usageGaugePopover.hidden = true;
    for (const gauge of document.querySelectorAll(usageGaugeSelector)) {
      gauge.setAttribute("aria-expanded", "false");
    }
  };
  const ensureUsageGaugePopover = () => {
    if (usageGaugePopover?.isConnected) return usageGaugePopover;
    const popover = document.createElement("section");
    popover.id = "codex-usage-gauge-popover";
    popover.setAttribute("data-codex-usage-gauge-popover", "true");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Codex 剩余用量");
    popover.hidden = true;

    const header = document.createElement("div");
    header.setAttribute("data-codex-usage-popover-header", "true");
    const title = document.createElement("span");
    title.setAttribute("data-codex-usage-popover-title", "true");
    title.textContent = "CODEX // CAPACITY";
    const sync = document.createElement("span");
    sync.setAttribute("data-codex-usage-popover-sync", "true");
    sync.textContent = "SYNC";
    header.append(title, sync);

    const summary = document.createElement("div");
    summary.setAttribute("data-codex-usage-popover-summary", "true");
    const number = document.createElement("strong");
    number.setAttribute("data-codex-usage-popover-number", "true");
    number.textContent = "—";
    const unit = document.createElement("span");
    unit.setAttribute("data-codex-usage-popover-unit", "true");
    unit.textContent = "% AVAILABLE";
    summary.append(number, unit);

    const strip = document.createElement("div");
    strip.setAttribute("data-codex-usage-popover-strip", "true");
    strip.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 10; index += 1) {
      const segment = document.createElement("i");
      segment.setAttribute("data-codex-usage-popover-segment", String(index));
      strip.appendChild(segment);
    }

    const rows = document.createElement("div");
    rows.setAttribute("data-codex-usage-popover-rows", "true");
    const source = document.createElement("div");
    source.setAttribute("data-codex-usage-popover-source", "true");
    source.textContent = "CODEX NATIVE LIMIT CACHE";
    popover.append(header, summary, strip, rows, source);
    document.body.appendChild(popover);
    usageGaugePopover = popover;
    return popover;
  };
  const updateUsageGaugePopover = (status) => {
    const popover = ensureUsageGaugePopover();
    popover.setAttribute("data-usage-level", status.available ? status.level : "unavailable");
    const remaining = status.available ? status.limitingBucket.remainingPercent : null;
    setNodeText(popover.querySelector('[data-codex-usage-popover-number="true"]'), remaining === null ? "—" : String(remaining));
    const activeSegments = remaining === null ? 0 : Math.max(remaining > 0 ? 1 : 0, Math.round(remaining / 10));
    [...popover.querySelectorAll("[data-codex-usage-popover-segment]")].forEach((segment, index) => {
      segment.toggleAttribute("data-active", index < activeSegments);
    });
    const rows = popover.querySelector('[data-codex-usage-popover-rows="true"]');
    rows.replaceChildren();
    if (!status.available) {
      const empty = document.createElement("div");
      empty.setAttribute("data-codex-usage-popover-empty", "true");
      empty.textContent = "原生用量数据暂不可用";
      rows.appendChild(empty);
      return popover;
    }
    for (const bucket of status.buckets) {
      const row = document.createElement("div");
      row.setAttribute("data-codex-usage-popover-row", "true");
      const label = document.createElement("span");
      label.setAttribute("data-codex-usage-popover-window", "true");
      label.textContent = bucket.label;
      const value = document.createElement("strong");
      value.setAttribute("data-codex-usage-popover-remaining", "true");
      value.textContent = String(bucket.remainingPercent) + "%";
      const reset = document.createElement("span");
      reset.setAttribute("data-codex-usage-popover-reset", "true");
      reset.textContent = "RESET " + formatUsageReset(bucket);
      row.append(label, value, reset);
      rows.appendChild(row);
    }
    return popover;
  };
  const openUsageGaugePopover = (anchor) => {
    const status = getCurrentRateLimitStatus();
    const popover = updateUsageGaugePopover(status);
    if (!popover.hidden) {
      closeUsageGaugePopover();
      return;
    }
    popover.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - popoverRect.width - 8, anchorRect.right - popoverRect.width));
    const preferredTop = anchorRect.top - popoverRect.height - 9;
    const top = preferredTop >= 8
      ? preferredTop
      : Math.min(window.innerHeight - popoverRect.height - 8, anchorRect.bottom + 9);
    popover.style.left = Math.round(left) + "px";
    popover.style.top = Math.round(top) + "px";
  };
  const createUsageGauge = () => {
    const gauge = document.createElement("button");
    gauge.type = "button";
    gauge.setAttribute("data-codex-usage-gauge", "true");
    gauge.setAttribute("aria-label", "查看 Codex 剩余用量");
    gauge.setAttribute("aria-haspopup", "dialog");
    gauge.setAttribute("aria-controls", "codex-usage-gauge-popover");
    gauge.setAttribute("aria-expanded", "false");

    const cells = document.createElement("span");
    cells.setAttribute("data-codex-usage-gauge-cells", "true");
    cells.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 5; index += 1) {
      const cell = document.createElement("i");
      cell.setAttribute("data-codex-usage-gauge-cell", String(index));
      cells.appendChild(cell);
    }
    const value = document.createElement("span");
    value.setAttribute("data-codex-usage-gauge-value", "true");
    value.textContent = "—";
    gauge.append(cells, value);
    gauge.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openUsageGaugePopover(gauge);
    });
    return gauge;
  };
  const mountUsageGauge = () => {
    const mode = getUsageGaugeMode();
    if (mode === "off") {
      document.querySelector(usageGaugeSelector)?.remove();
      closeUsageGaugePopover();
      return null;
    }
    const profile = document.querySelector(
      'button[aria-label="打开个人资料菜单"], button[aria-label="Open profile menu"]',
    );
    const host = profile?.parentElement;
    if (!profile || !host) return null;
    let gauge = document.querySelector(usageGaugeSelector);
    if (!gauge) gauge = createUsageGauge();
    if (gauge.parentElement !== host || gauge.previousElementSibling !== profile) {
      profile.insertAdjacentElement("afterend", gauge);
    }
    setNodeAttribute(gauge, "data-mode", mode);
    return gauge;
  };
  const refreshUsageGauge = () => {
    const gauge = mountUsageGauge();
    if (!gauge) {
      setNodeAttribute(root, "data-codex-usage-source", getUsageGaugeMode() === "off" ? "disabled" : "unavailable");
      removeNodeAttribute(root, "data-codex-usage-remaining");
      return false;
    }
    const status = getCurrentRateLimitStatus();
    setNodeAttribute(gauge, "data-usage-level", status.available ? status.level : "unavailable");
    const remaining = status.available ? status.limitingBucket.remainingPercent : null;
    const activeCells = remaining === null ? 0 : Math.max(remaining > 0 ? 1 : 0, Math.ceil(remaining / 20));
    [...gauge.querySelectorAll("[data-codex-usage-gauge-cell]")].forEach((cell, index) => {
      toggleNodeAttribute(cell, "data-active", index < activeCells);
    });
    setNodeText(gauge.querySelector('[data-codex-usage-gauge-value="true"]'), remaining === null ? "—" : String(remaining));
    const details = status.available
      ? "Codex 剩余用量 " + remaining + "% · " + status.limitingBucket.label + " · " + formatUsageReset(status.limitingBucket) + " 重置"
      : "Codex 原生用量数据暂不可用";
    setNodeAttribute(gauge, "title", details);
    setNodeAttribute(gauge, "aria-label", details + "，点击查看详情");
    setNodeAttribute(root, "data-codex-usage-source", status.source);
    setNodeAttribute(root, "data-codex-usage-gauge-mode", getUsageGaugeMode());
    if (remaining === null) removeNodeAttribute(root, "data-codex-usage-remaining");
    else setNodeAttribute(root, "data-codex-usage-remaining", String(remaining));
    if (usageGaugePopover && !usageGaugePopover.hidden) updateUsageGaugePopover(status);
    return true;
  };

  const getCurrentConversation = () => {
    const conversationId = getActiveConversationId();
    const store = findConversationStore();
    return conversationId && store?.conversations instanceof Map
      ? store.conversations.get(conversationId) || null
      : null;
  };
  const isVisibleStatusNode = (node) => {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const getCurrentTaskTitle = (conversation) => {
    const title = typeof conversation?.title === "string" ? conversation.title.trim() : "";
    if (title) return title;
    const row = document.querySelector(
      threadRowSelector + '[data-app-action-sidebar-thread-active="true"], ' +
      threadRowSelector + '[data-app-action-sidebar-thread-selected="true"]',
    );
    return (row?.getAttribute("data-app-action-sidebar-thread-label") || row?.textContent || "Codex task")
      .replace(/\\s+/g, " ").trim();
  };
  const completedActivityPattern = /^(?:\u5df2(?:\u8fd0\u884c|\u7f16\u8f91|\u66f4\u65b0|\u67e5\u770b|\u8bfb\u53d6|\u641c\u7d22|\u7b49\u5f85|\u751f\u6210)|Ran |Edited |Updated |Viewed |Read |Searched |Waited |Generated )/i;
  const runningActivityPattern = /^(?:\u6b63\u5728(?:\u8fd0\u884c|\u7f16\u8f91|\u66f4\u65b0|\u67e5\u770b|\u8bfb\u53d6|\u641c\u7d22|\u7b49\u5f85|\u751f\u6210)|Running |Editing |Updating |Viewing |Reading |Searching |Waiting |Generating )/i;
  let liveActivityHasWork = false;
  let liveActivityWasActive = false;
  let liveActivityTaskId = null;
  const liveActivityTaskAttribute = "data-codex-live-task-id";
  const liveActivityCollapseToggleRevision = "single-click-v5";
  const liveActivityCollapseOwner = "collapse-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const liveActivityCollapseMemory = new Map();
  root.removeAttribute("data-codex-live-manual-collapse");
  root.removeAttribute(liveActivityTaskAttribute);
  const modelPairPattern = /\\b(?:SOL|Terra|Luna|GPT[-\\s]?\\d+(?:\\.\\d+)?|o\\d+(?:[-\\w]*)?|\\d+(?:\\.\\d+)?\\s+[A-Za-z][\\w.-]*(?:\\s+[A-Za-z][\\w.-]*){0,2})\\s*(?:high\\s*effort|medium\\s*effort|low\\s*effort|maximum|ultra|xhigh|max|medium|high|mid|low|超高|最高|极高|轻度|中|高)/gi;
  const getCurrentModelPair = (conversation) => {
    const effortLabel = (value) => {
      const normalized = String(value || "").trim().toLowerCase().replace(/\\s+effort$/, "");
      return ({
        "轻度": "L",
        "low": "L",
        "中": "M",
        "mid": "M",
        "medium": "M",
        "高": "H",
        "high": "H",
        "极高": "XH",
        "xhigh": "XH",
        "超高": "ULTRA",
        "ultra": "ULTRA",
        "最高": "MAX",
        "max": "MAX",
        "maximum": "MAX",
      })[normalized] || String(value || "").trim();
    };
    const selectedModel = document.querySelector(
      '[data-composer-navigation-target="reasoning"] [data-composer-footer-collapse="none"], ' +
      '[data-composer-footer-collapse="none"]',
    );
    const selectedText = (selectedModel?.textContent || "").replace(/\\s+/g, " ").trim();
    const selectedMatch = selectedText.match(/^(.+?)(超高|最高|极高|轻度|maximum|ultra|xhigh|max|medium|high|mid|low|中|高)$/i);
    if (selectedMatch) return selectedMatch[1].trim() + " " + effortLabel(selectedMatch[2].toLowerCase());
    const candidates = [];
    const collect = (value, depth = 0) => {
      if (depth > 2 || value == null) return;
      if (typeof value === "string") {
        candidates.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.slice(0, 12).forEach((item) => collect(item, depth + 1));
        return;
      }
      if (typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          if (/model|reasoning|effort|agent/i.test(key)) collect(item, depth + 1);
        }
      }
    };
    collect(conversation);
    const surface = document.querySelector("[data-app-shell-main-surface]") || document.body;
    for (const node of surface.querySelectorAll("button, [role=button], [aria-label], [title], [data-testid]")) {
      if (!isVisibleStatusNode(node)) continue;
      candidates.push(node.getAttribute("aria-label") || "", node.getAttribute("title") || "", node.textContent || "");
    }
    const pairs = [];
    for (const candidate of candidates) {
      const found = String(candidate).match(modelPairPattern) || [];
      for (const pair of found) {
        const normalized = pair.replace(/\\s+/g, " ").trim()
          .replace(/\\s*(超高|最高|极高|轻度|maximum|ultra|xhigh|max|high\\s*effort|medium\\s*effort|low\\s*effort|medium|high|mid|low|中|高)$/i,
            (_, effort) => " " + effortLabel(effort))
          .replace(/\\s+/g, " ").trim();
        if (!pairs.includes(normalized)) pairs.push(normalized);
      }
    }
    return pairs.slice(0, 3).join(" + ") || "—";
  };
  const parseTaskElapsedSeconds = (text) => {
    const value = String(text || "").replace(/\\s+/g, " ").trim();
    const clock = value.match(/(?:\\b(\\d{1,2}):)?(\\d{1,2}):(\\d{2})\\b/);
    if (clock) return (Number(clock[1] || 0) * 3600) + (Number(clock[2]) * 60) + Number(clock[3]);
    const hours = Number(value.match(/(\\d+)\\s*(?:小时|hour)/i)?.[1] || 0);
    const minutes = Number(value.match(/(\\d+)\\s*(?:分钟|分|minute|min)/i)?.[1] || 0);
    const seconds = Number(value.match(/(\\d+)\\s*(?:秒|second|sec)/i)?.[1] || 0);
    const total = (hours * 3600) + (minutes * 60) + seconds;
    return total > 0 ? total : null;
  };
  const getMainTaskElapsed = () => {
    const surface = document.querySelector("[data-app-shell-main-surface]") || document.body;
    const labels = [...surface.querySelectorAll("span")].filter((node) =>
      node.children.length === 0 && isVisibleStatusNode(node) &&
      /^耗时\\s*/.test((node.textContent || "").replace(/\\s+/g, " ").trim()),
    );
    const elapsedValues = labels.map((node) => parseTaskElapsedSeconds(node.textContent))
      .filter((value) => Number.isFinite(value));
    return {
      count: elapsedValues.length,
      seconds: elapsedValues.at(-1) ?? null,
    };
  };
  const getConversationById = (conversationId) => {
    const store = findConversationStore();
    return conversationId && store?.conversations instanceof Map
      ? store.conversations.get(conversationId) || null
      : null;
  };
  const getRuntimeConversation = () => {
    const store = findConversationStore();
    if (!(store?.conversations instanceof Map)) return null;
    const current = getCurrentConversation();
    if (current?.threadRuntimeStatus?.type === "active") return current;
    return [...store.conversations.values()]
      .filter((conversation) => conversation?.threadRuntimeStatus?.type === "active")
      .sort((left, right) => Number(right?.updatedAt || right?.recencyAt || 0) - Number(left?.updatedAt || left?.recencyAt || 0))[0] || null;
  };
  const classifyToolActivity = (text) => {
    if (/\u66f4\u65b0.*\u8ba1\u5212|updated.*plan/i.test(text)) return "update_plan";
    if (/\u67e5\u770b.*\u56fe|viewed.*image/i.test(text)) return "view_image";
    if (/\u751f\u6210.*\u56fe|generated.*image/i.test(text)) return "image_gen";
    if (/\u641c\u7d22.*(?:\u7f51\u7edc|\u9875)|searched.*(?:web|page)/i.test(text)) return "web";
    if (/\u7b49\u5f85|waited/i.test(text)) return "wait";
    if (/\u7f16\u8f91|edited/i.test(text)) return "apply_patch";
    if (/\u8bfb\u53d6|read /i.test(text)) return "read";
    return "shell_command";
  };
  const getCurrentTurnActivity = () => {
    const surface = document.querySelector("[data-app-shell-main-surface]") || document.body;
    const turns = [...surface.querySelectorAll("[data-content-search-turn-key]")];
    const scope = turns.at(-1) || surface;
    const entries = [...scope.querySelectorAll("span")].map((node) => {
      const text = (node.textContent || "").replace(/\\s+/g, " ").trim();
      const state = completedActivityPattern.test(text)
        ? "done"
        : runningActivityPattern.test(text)
          ? "running"
          : null;
      return node.children.length === 0 && state && isVisibleStatusNode(node)
        ? { text, state, tool: classifyToolActivity(text) }
        : null;
    }).filter(Boolean);
    const completedCount = entries.filter((entry) => entry.state === "done").length;
    const runningCount = entries.some((entry) => entry.state === "running") ? 1 : 0;
    return {
      turnKey: scope.getAttribute?.("data-content-search-turn-key") || null,
      entries,
      eventCount: completedCount + runningCount,
      latestTool: entries.at(-1)?.tool || null,
    };
  };
  const getLatestToolActivity = (turnActivity = null) => {
    if (turnActivity?.latestTool) return turnActivity.latestTool;
    const surface = document.querySelector("[data-app-shell-main-surface]") || document.body;
    const nodes = [...surface.querySelectorAll("span")].filter((node) => {
      const text = (node.textContent || "").replace(/\\s+/g, " ").trim();
      return node.children.length === 0 &&
        (completedActivityPattern.test(text) || runningActivityPattern.test(text)) &&
        isVisibleStatusNode(node);
    });
    const text = (nodes.at(-1)?.textContent || "").replace(/\\s+/g, " ").trim();
    return text ? classifyToolActivity(text) : null;
  };
  const getVisibleAgentStates = () => {
    const selectors = [
      '[data-content-search-turn-key] [data-testid*="agent" i]',
      '[data-content-search-turn-key] [class*="subagent" i]',
      '[data-content-search-turn-key] [class*="agent-activity" i]',
    ].join(",");
    const states = new Map();
    for (const node of document.querySelectorAll(selectors)) {
      if (!isVisibleStatusNode(node)) continue;
      const text = (node.textContent || "").replace(/\\s+/g, " ").trim();
      if (!/^(?:(?:\u5df2)?(?:\u542f\u52a8|\u521b\u5efa|\u6d3e\u53d1|\u7b49\u5f85|\u5b8c\u6210).*(?:agent|\u4ee3\u7406)|(?:spawned|created|waiting for|completed)\\s+(?:sub)?agent|(?:sub)?agent\\s+)/i.test(text)) {
        continue;
      }
      const match = text.match(/(?:(?:subagents?|agents?)\\b|\u5b50\u4ee3\u7406|\u4ee3\u7406)\\s*[:\uFF1A\u00b7-]?\\s*([a-z][\\w.-]{1,30})/i);
      if (!match) continue;
      const name = match[1];
      const status = /\u5df2\u5b8c\u6210|completed|\\bdone\\b/i.test(text)
        ? "done"
        : /\u7b49\u5f85|waiting|queued|pending/i.test(text)
          ? "waiting"
          : "running";
      states.set(name, { name, status });
      if (states.size >= 8) break;
    }
    return [...states.values()];
  };
  const getLiveActivityCollapseKey = (widget, taskId = null) =>
    String(taskId || widget?.getAttribute(liveActivityTaskAttribute) || "__idle__");
  const rememberLiveActivityCollapse = (widget, taskId = null, liveState = null) => {
    const key = getLiveActivityCollapseKey(widget, taskId);
    const snapshot = {
      state: String(liveState || widget?.getAttribute("data-live-state") || "idle"),
      condensed: Boolean(widget?.hasAttribute("data-condensed")),
    };
    // Keep only a small renderer-local LRU. This survives a React/sidebar
    // remount and thread navigation without creating a persistent preference.
    liveActivityCollapseMemory.delete(key);
    liveActivityCollapseMemory.set(key, snapshot);
    while (liveActivityCollapseMemory.size > 12) {
      liveActivityCollapseMemory.delete(liveActivityCollapseMemory.keys().next().value);
    }
    return snapshot;
  };
  const restoreLiveActivityCollapse = (widget, taskId, liveState) => {
    const snapshot = liveActivityCollapseMemory.get(getLiveActivityCollapseKey(widget, taskId));
    if (!snapshot || snapshot.state !== liveState) return false;
    if (widget.hasAttribute("data-condensed") !== snapshot.condensed) {
      widget.toggleAttribute("data-condensed", snapshot.condensed);
    }
    return true;
  };
  const syncLiveActivityCollapseToggle = (widget) => {
    const collapseToggle = widget.querySelector('[data-codex-live-collapse-toggle="true"]');
    const isCondensed = widget.hasAttribute("data-condensed");
    setNodeAttribute(collapseToggle, "aria-expanded", isCondensed ? "false" : "true");
    setNodeAttribute(collapseToggle, "aria-label", isCondensed ? "展开任务状态" : "折叠任务状态");
    if (collapseToggle) {
      setNodeAttribute(collapseToggle, "title", isCondensed ? "展开任务状态" : "折叠任务状态");
      setNodeText(collapseToggle, isCondensed ? "⌄" : "⌃");
    }
  };
  const toggleLiveActivityCollapsed = (widget) => {
    // Manual collapse is a direct DOM interaction.  Status heartbeats update
    // content only and cannot overwrite the user's current open/closed choice.
    widget.toggleAttribute("data-condensed");
    rememberLiveActivityCollapse(widget);
    syncLiveActivityCollapseToggle(widget);
  };
  const createLiveActivityCollapseToggle = (widget) => {
    const collapseToggle = document.createElement("button");
    collapseToggle.type = "button";
    collapseToggle.setAttribute("data-codex-live-collapse-toggle", "true");
    collapseToggle.setAttribute("data-codex-live-collapse-revision", liveActivityCollapseToggleRevision);
    collapseToggle.setAttribute("data-codex-live-collapse-owner", liveActivityCollapseOwner);
    collapseToggle.setAttribute("aria-label", "折叠任务状态");
    collapseToggle.title = "折叠任务状态";
    collapseToggle.textContent = "⌃";
    collapseToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleLiveActivityCollapsed(widget);
    });
    return collapseToggle;
  };
  const createLiveActivityWidget = () => {
    const widget = document.createElement("section");
    widget.setAttribute("data-codex-live-activity", "true");
    widget.setAttribute("data-live-state", "idle");
    widget.setAttribute("role", "status");
    widget.setAttribute("aria-live", "polite");

    const header = document.createElement("div");
    header.setAttribute("data-codex-live-header", "true");
    const title = document.createElement("span");
    title.setAttribute("data-codex-live-title", "true");
    title.textContent = "";
    const state = document.createElement("span");
    state.setAttribute("data-codex-live-state-label", "true");
    const stateText = document.createElement("span");
    stateText.setAttribute("data-codex-live-state-text", "true");
    stateText.textContent = "READY";
    const stateDot = document.createElement("i");
    stateDot.setAttribute("aria-hidden", "true");
    state.append(stateText, stateDot);
    header.append(state, title);
    const collapseToggle = createLiveActivityCollapseToggle(widget);
    header.append(collapseToggle);

    const body = document.createElement("div");
    body.setAttribute("data-codex-live-body", "true");
    const meta = document.createElement("div");
    meta.setAttribute("data-codex-live-progress-meta", "true");
    const progressLabel = document.createElement("span");
    progressLabel.setAttribute("data-codex-live-progress-label", "true");
    progressLabel.textContent = "ACTIVITY STAGE";
    const progressValue = document.createElement("span");
    progressValue.setAttribute("data-codex-live-progress-value", "true");
    progressValue.textContent = "1 / 4";
    meta.append(progressLabel, progressValue);

    const progress = document.createElement("div");
    progress.setAttribute("data-codex-live-progress", "true");
    progress.setAttribute("data-mode", "indeterminate");
    for (let index = 0; index < 4; index += 1) {
      const segment = document.createElement("span");
      segment.setAttribute("data-codex-live-progress-segment", String(index));
      segment.setAttribute("data-state", "waiting");
      progress.appendChild(segment);
    }

    const rows = document.createElement("div");
    rows.setAttribute("data-codex-live-rows", "true");
    for (const [key, label] of [["task", "TASK"], ["model", "MOD"], ["tool", "TOOL"], ["agents", "AGENTS"]]) {
      const row = document.createElement("div");
      row.setAttribute("data-codex-live-row", key);
      const rowLabel = document.createElement("span");
      rowLabel.setAttribute("data-codex-live-row-label", "true");
      rowLabel.textContent = label;
      const value = document.createElement("span");
      value.setAttribute("data-codex-live-row-value", "true");
      row.append(rowLabel, value);
      rows.appendChild(row);
    }
    body.append(meta, progress, rows);
    widget.append(header, body);
    return widget;
  };
  const mountLiveActivity = () => {
    const sidebar = document.querySelector(".app-shell-left-panel");
    if (!sidebar) return null;
    let widget = document.querySelector(liveActivitySelector);
    if (!widget) widget = createLiveActivityWidget();
    if (widget.parentElement !== sidebar) sidebar.appendChild(widget);
    const header = widget.querySelector('[data-codex-live-header="true"]');
    const state = header?.querySelector('[data-codex-live-state-label="true"]');
    const title = header?.querySelector('[data-codex-live-title="true"]');
    let collapseToggle = header?.querySelector('[data-codex-live-collapse-toggle="true"]');
    if (header && collapseToggle && (
      collapseToggle.getAttribute("data-codex-live-collapse-revision") !== liveActivityCollapseToggleRevision ||
      collapseToggle.getAttribute("data-codex-live-collapse-owner") !== liveActivityCollapseOwner
    )) {
      const replacement = createLiveActivityCollapseToggle(widget);
      collapseToggle.replaceWith(replacement);
      collapseToggle = replacement;
    } else if (header && !collapseToggle) {
      collapseToggle = createLiveActivityCollapseToggle(widget);
      header.append(collapseToggle);
    }
    if (header && state && title && collapseToggle) {
      const orderReady = state.parentElement === header &&
        title.parentElement === header && collapseToggle.parentElement === header &&
        state.nextElementSibling === title && title.nextElementSibling === collapseToggle &&
        collapseToggle === header.lastElementChild;
      // Moving already-mounted children emits childList mutations.  The body
      // observer treats those as application activity, so unconditional append
      // created a refresh loop and made the other indicator animations stutter.
      if (!orderReady) header.append(state, title, collapseToggle);
    }
    const sidebarRect = sidebar.getBoundingClientRect();
    toggleNodeAttribute(widget, "data-compact", sidebarRect.width < 300 || sidebarRect.height < 620);
    removeNodeAttribute(widget, "data-auto-condensed");
    return widget;
  };
  const setLiveSegmentStates = (progress, total, done, active, knownProgress, observedStage = 1) => {
    const segments = [...(progress?.querySelectorAll('[data-codex-live-progress-segment]') || [])];
    setNodeAttribute(progress, "data-mode", knownProgress ? "determinate" : "indeterminate");
    const completedVisual = knownProgress && total > 0 ? Math.floor((done / total) * segments.length) : 0;
    const runningVisual = knownProgress && active && done < total
      ? Math.min(segments.length - 1, completedVisual)
      : -1;
    const activityVisual = active
      ? Math.max(0, Math.min(segments.length - 1, Number(observedStage || 1) - 1))
      : -1;
    segments.forEach((segment, index) => {
      const state = knownProgress
        ? index < completedVisual
          ? "done"
          : index === runningVisual
            ? "running"
            : "waiting"
        : index < activityVisual
          ? "done"
          : index === activityVisual
            ? "running"
            : "waiting";
      setNodeAttribute(segment, "data-state", state);
    });
  };
  const refreshLiveActivity = () => {
    if (!getLiveActivityEnabled()) {
      document.querySelector(liveActivitySelector)?.remove();
      root.removeAttribute("data-codex-live-activity-source");
      root.removeAttribute("data-codex-live-subtask-total");
      root.removeAttribute("data-codex-live-subtask-done");
      root.removeAttribute("data-codex-live-observed-events");
      root.removeAttribute("data-codex-live-stage");
      return false;
    }
    const widget = mountLiveActivity();
    if (!widget) return false;
    const currentConversation = getCurrentConversation();
    const runtimeConversation = getRuntimeConversation();
    const forced = liveActivityForcedState && typeof liveActivityForcedState === "object"
      ? liveActivityForcedState
      : null;
    const runtimeActive = Boolean(runtimeConversation) || hasVisibleOnlineCoreActivity();
    const active = forced ? forced.active !== false : runtimeActive;
    const taskId = forced
      ? String(forced.taskId || "forced-live-activity")
      : runtimeConversation?.id || liveActivityTaskId || currentConversation?.id || null;
    const conversation = active
      ? runtimeConversation || currentConversation
      : getConversationById(liveActivityTaskId) || currentConversation;
    if (active && (!liveActivityWasActive || taskId !== liveActivityTaskId)) {
      liveActivityTaskId = taskId;
    }
    if (active) liveActivityHasWork = true;
    const completed = !active && liveActivityHasWork;
    liveActivityWasActive = active;
    const task = String(forced?.task || getCurrentTaskTitle(conversation) || "Codex task");
    const turnActivity = forced
      ? {
          eventCount: Number.isFinite(Number(forced.observedEvents)) ? Math.max(0, Number(forced.observedEvents)) : 0,
          latestTool: null,
        }
      : getCurrentTurnActivity();
    const tool = String(forced?.tool || getLatestToolActivity(turnActivity) || (active ? "reasoning" : "ready"));
    const agents = Array.isArray(forced?.agents)
      ? forced.agents.map((agent) => typeof agent === "string" ? { name: agent, status: "running" } : agent)
      : getVisibleAgentStates();
    const total = Number.isFinite(Number(forced?.total))
      ? Math.max(0, Number(forced.total))
      : agents.length;
    const done = Number.isFinite(Number(forced?.done))
      ? Math.max(0, Math.min(total, Number(forced.done)))
      : agents.filter((agent) => agent.status === "done").length;
    const knownProgress = total > 1;
    const observedStage = active ? Math.max(1, Math.min(4, 1 + turnActivity.eventCount)) : 0;

    const statusText = active ? "Running" : completed ? "Complete" : "READY";
    const nextLiveState = active ? "active" : completed ? "complete" : "idle";
    const previousLiveState = widget.getAttribute("data-live-state");
    const previousTaskId = widget.getAttribute(liveActivityTaskAttribute);
    const taskChanged = Boolean(active && taskId && previousTaskId !== taskId);
    setNodeAttribute(widget, "data-live-state", nextLiveState);
    if (taskId) setNodeAttribute(widget, liveActivityTaskAttribute, taskId);
    else removeNodeAttribute(widget, liveActivityTaskAttribute);
    const restoredCollapse = restoreLiveActivityCollapse(widget, taskId, nextLiveState);
    if (!restoredCollapse && (previousLiveState !== nextLiveState || taskChanged)) {
      widget.toggleAttribute("data-condensed", nextLiveState !== "active");
      rememberLiveActivityCollapse(widget, taskId, nextLiveState);
    }
    const title = widget.querySelector('[data-codex-live-title="true"]');
    const titleText = active ? "Running" : completed ? "Complete" : "Ready";
    setNodeText(title, titleText);
    setNodeAttribute(title, "data-codex-live-title-text", titleText);
    setNodeText(widget.querySelector('[data-codex-live-state-text="true"]'), active ? "有任务在执行" : "");
    syncLiveActivityCollapseToggle(widget);
    setNodeText(widget.querySelector('[data-codex-live-progress-label="true"]'), "STATUS");
    setNodeText(widget.querySelector('[data-codex-live-progress-value="true"]'), statusText);
    setLiveSegmentStates(
      widget.querySelector('[data-codex-live-progress="true"]'), total, done, active, knownProgress, observedStage,
    );
    setNodeText(widget.querySelector('[data-codex-live-row="task"] [data-codex-live-row-value="true"]'), task);
    setNodeText(widget.querySelector('[data-codex-live-row="model"] [data-codex-live-row-value="true"]'), String(forced?.model || getCurrentModelPair(conversation)));
    setNodeText(widget.querySelector('[data-codex-live-row="tool"] [data-codex-live-row-value="true"]'), tool);
    const agentNames = agents.map((agent) => agent.name).filter(Boolean);
    const visibleAgentNames = agentNames.slice(0, 2);
    const agentText = visibleAgentNames.length
      ? visibleAgentNames.join("  \u00b7  ") + (agentNames.length > 2 ? "  +" + (agentNames.length - 2) : "")
      : "PRIMARY";
    setNodeText(widget.querySelector('[data-codex-live-row="agents"] [data-codex-live-row-value="true"]'), agentText);
    setNodeAttribute(widget, "aria-label", active
      ? "LIVE ACTIVITY: " + task + ", Running"
      : completed ? "LIVE ACTIVITY: " + task + ", Complete" : "LIVE ACTIVITY: READY");
    setNodeAttribute(root, "data-codex-live-activity-source", forced
      ? "controller-preview"
      : knownProgress
        ? "subagent-dom"
        : "turn-activity");
    setNodeAttribute(root, "data-codex-live-observed-events", String(turnActivity.eventCount));
    setNodeAttribute(root, "data-codex-live-stage", String(observedStage));
    if (knownProgress) {
      setNodeAttribute(root, "data-codex-live-subtask-total", String(total));
      setNodeAttribute(root, "data-codex-live-subtask-done", String(done));
    } else {
      removeNodeAttribute(root, "data-codex-live-subtask-total");
      removeNodeAttribute(root, "data-codex-live-subtask-done");
    }
    return true;
  };
  const setLiveActivityState = (value = "auto") => {
    liveActivityForcedState = value && typeof value === "object" ? value : null;
    refreshLiveActivity();
    return root.getAttribute("data-codex-live-activity-source");
  };
  const refreshStatusWidgets = () => {
    statusWidgetLastRefreshAt = performance.now();
    document.querySelector('[data-codex-footer-telemetry="true"]')?.remove();
    const contextMounted = refreshContextWidget();
    const activityMounted = refreshLiveActivity();
    const usageMounted = refreshUsageGauge();
    return contextMounted || activityMounted || usageMounted;
  };
  const queueStatusWidgetRefresh = () => {
    if (statusWidgetRefreshQueued) return;
    statusWidgetRefreshQueued = true;
    const elapsed = performance.now() - statusWidgetLastRefreshAt;
    const delay = Math.max(80, 400 - elapsed);
    schedule(() => {
      statusWidgetRefreshQueued = false;
      refreshStatusWidgets();
    }, delay);
  };
  const scheduleStatusWidgetHeartbeat = () => {
    schedule(() => {
      if (!statusWidgetLoopActive) return;
      try {
        reconcileDynamicShell();
        refreshStatusWidgets();
      } finally {
        if (statusWidgetLoopActive) scheduleStatusWidgetHeartbeat();
      }
    }, 2000);
  };

  const startupHydrationReady = () => {
    const sidebar = document.querySelector(".app-shell-left-panel");
    const projectRows = [...document.querySelectorAll(projectRowSelector)];
    const projectIconsReady = projectRows.length > 0 && projectRows.every((row) =>
      Boolean(row.querySelector("[" + projectIconAttribute + "]")),
    );
    return Boolean(
      sidebar &&
      projectIconsReady &&
      document.querySelector(onlineCoreSelector) &&
      document.querySelector("[data-composer-surface-variant]") &&
      projectColorObservedSidebar === sidebar &&
      onlineCoreObservedBody === document.body
    );
  };
  const stopStartupHydrationObserver = (state = "ready") => {
    if (startupHydrationStopped) return;
    startupHydrationStopped = true;
    startupHydrationObserver?.disconnect();
    startupHydrationObserver = null;
    root.setAttribute("data-codex-startup-sync", state);
  };
  const refreshStartupHydration = () => {
    startupHydrationRefreshQueued = false;
    if (startupHydrationStopped) return;
    // These mounts are idempotent. During cold Electron startup the style can
    // arrive several seconds before React creates the sidebar and Composer;
    // retry on the exact hydration mutations instead of guessing a delay.
    try { mountProjectColors(); } catch {}
    try { mountOnlineCore(); } catch {}
    try { refreshStatusWidgets(); } catch {}
    if (startupHydrationReady()) stopStartupHydrationObserver("ready");
  };
  const queueStartupHydrationRefresh = () => {
    if (startupHydrationStopped || startupHydrationRefreshQueued) return;
    startupHydrationRefreshQueued = true;
    // A timer can be delayed for more than a second while React completes its
    // cold-start commit. A microtask runs after the current mutation batch and
    // before the next paint, keeping these three surfaces visually in sync.
    queueMicrotask(refreshStartupHydration);
  };
  const ensureStartupHydrationObserver = () => {
    if (startupHydrationObserver || startupHydrationStopped || !document.documentElement) return false;
    root.setAttribute("data-codex-startup-sync", "waiting");
    startupHydrationObserver = new MutationObserver(queueStartupHydrationRefresh);
    startupHydrationObserver.observe(document.documentElement, { childList: true, subtree: true });
    queueStartupHydrationRefresh();
    schedule(() => stopStartupHydrationObserver("timeout"), 30000);
    return true;
  };

  const themeGroup = () => {
    const input = document.querySelector('input[name="appearance-theme"]');
    return input?.closest('[role="radiogroup"]') || null;
  };
  const isLightThemeInput = (input) => /^(\u6d45\u8272|Light)$/i.test(input?.getAttribute("aria-label") || "");
  let nativeSelectionReconciled = false;

  const syncSurfaceControl = (control) => {
    const active = root.getAttribute("data-codex-surface-layout") === activeValue;
    for (const button of control.querySelectorAll('[data-codex-surface-layout-value]')) {
      const selected = (button.getAttribute("data-codex-surface-layout-value") === activeValue) === active;
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.toggleAttribute("data-active", selected);
    }
    control.setAttribute("data-surface-active", active ? "true" : "false");
  };

  const syncAssistantIndicatorControl = (control) => {
    const selectedValue = getAssistantIndicator();
    const enabled = getAssistantIndicatorEnabled();
    setAssistantIndicator(selectedValue, false);
    setAssistantIndicatorEnabled(enabled, false);
    for (const button of control.querySelectorAll('[data-codex-assistant-indicator-value]')) {
      const selected = button.getAttribute("data-codex-assistant-indicator-value") === selectedValue;
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.toggleAttribute("data-active", selected);
      // The four visual styles are shared by the response rail and Online
      // Core, so they stay editable when either visibility switch is off.
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
    }
    const switchButton = control.querySelector('[data-codex-assistant-enabled-switch="true"]');
    switchButton?.setAttribute("aria-checked", enabled ? "true" : "false");
    switchButton?.toggleAttribute("data-active", enabled);
    control.setAttribute("data-enabled", enabled ? "true" : "false");
  };

  const syncOnlineCoreControl = (control) => {
    const enabled = getOnlineCoreEnabled();
    setOnlineCoreEnabled(enabled, false);
    const switchButton = control.querySelector('[data-codex-online-core-switch="true"]');
    switchButton?.setAttribute("aria-checked", enabled ? "true" : "false");
    switchButton?.toggleAttribute("data-active", enabled);
    if (switchButton) {
      switchButton.disabled = false;
      switchButton.setAttribute("aria-disabled", "false");
    }
    control.setAttribute("data-enabled", enabled ? "true" : "false");
  };

  const syncLiveActivityControl = (control) => {
    const enabled = getLiveActivityEnabled();
    const accent = getLiveActivityAccent();
    setLiveActivityEnabled(enabled, false);
    setLiveActivityAccent(accent, false);
    for (const button of control.querySelectorAll('[data-codex-live-activity-accent-value]')) {
      const selected = button.getAttribute("data-codex-live-activity-accent-value") === accent;
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.toggleAttribute("data-active", selected);
    }
    const switchButton = control.querySelector('[data-codex-live-activity-switch="true"]');
    switchButton?.setAttribute("aria-checked", enabled ? "true" : "false");
    switchButton?.toggleAttribute("data-active", enabled);
    if (switchButton) {
      switchButton.disabled = false;
      switchButton.setAttribute("aria-disabled", "false");
    }
    control.setAttribute("data-enabled", enabled ? "true" : "false");
  };

  const syncUsageGaugeControl = (control) => {
    const mode = getUsageGaugeMode();
    setUsageGaugeMode(mode, false);
    for (const button of control.querySelectorAll('[data-codex-usage-gauge-mode-value]')) {
      const selected = button.getAttribute("data-codex-usage-gauge-mode-value") === mode;
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.toggleAttribute("data-active", selected);
    }
    control.setAttribute("data-mode", mode);
  };

  const mountAssistantIndicatorControl = (layoutControl) => {
    if (!layoutControl?.isConnected) return false;
    let control = document.querySelector('[data-codex-assistant-indicator-control="true"]');
    if (!control) {
      control = document.createElement("div");
      control.setAttribute("data-codex-assistant-indicator-control", "true");

      const copy = document.createElement("div");
      copy.setAttribute("data-codex-assistant-indicator-copy", "true");
      const title = document.createElement("div");
      title.setAttribute("data-codex-assistant-indicator-title", "true");
      title.textContent = "Assistant \u72b6\u6001\u6761";
      const description = document.createElement("div");
      description.setAttribute("data-codex-assistant-indicator-description", "true");
      description.textContent = "\u53f3\u4fa7\u5f00\u5173\u53ea\u63a7\u5236\u56de\u590d\u9876\u90e8\u52a8\u6001\uff1b\u56db\u79cd\u6837\u5f0f\u4e0e\u5de6\u4e0a\u89d2\u5728\u7ebf\u706f\u5171\u7528\u3002";
      copy.append(title, description);

      const options = document.createElement("div");
      options.setAttribute("data-codex-assistant-indicator-options", "true");
      options.setAttribute("role", "radiogroup");
      options.setAttribute("aria-label", "Assistant \u72b6\u6001\u6761");
      for (const [value, label] of [
        ["rider", "\u6e38\u4fa0\u7ea2"],
        ["current", "\u7d2b\u767d\u547c\u5438"],
        ["ecg", "\u5fc3\u7535\u7eff"],
        ["vox", "VOX \u7535\u6ce2"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.setAttribute("data-codex-assistant-indicator-value", value);
        button.textContent = label;
        button.addEventListener("click", () => {
          setAssistantIndicator(value, true);
          syncAssistantIndicatorControl(control);
        });
        options.appendChild(button);
      }

      const actions = document.createElement("div");
      actions.setAttribute("data-codex-assistant-indicator-actions", "true");
      actions.appendChild(options);

      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.setAttribute("role", "switch");
      switchButton.setAttribute("aria-label", "\u542f\u7528 Assistant \u72b6\u6001\u6761");
      switchButton.setAttribute("data-codex-assistant-enabled-switch", "true");
      const knob = document.createElement("span");
      knob.setAttribute("data-codex-assistant-enabled-knob", "true");
      switchButton.appendChild(knob);
      switchButton.addEventListener("click", () => {
        setAssistantIndicatorEnabled(!getAssistantIndicatorEnabled(), true);
        syncAssistantIndicatorControl(control);
      });
      actions.appendChild(switchButton);
      control.append(copy, actions);
    }

    if (control.previousElementSibling !== layoutControl) {
      layoutControl.insertAdjacentElement("afterend", control);
    }
    syncAssistantIndicatorControl(control);
    return true;
  };

  const mountOnlineCoreControl = (indicatorControl) => {
    if (!indicatorControl?.isConnected) return false;
    let control = document.querySelector('[data-codex-online-core-control="true"]');
    if (!control) {
      control = document.createElement("div");
      control.setAttribute("data-codex-online-core-control", "true");

      const copy = document.createElement("div");
      copy.setAttribute("data-codex-online-core-copy", "true");
      const title = document.createElement("div");
      title.setAttribute("data-codex-online-core-title", "true");
      title.textContent = "\u5de6\u4e0a\u89d2\u5728\u7ebf\u706f";
      const description = document.createElement("div");
      description.setAttribute("data-codex-online-core-description", "true");
      description.textContent = "\u53ea\u63a7\u5236\u4fa7\u680f\u5de6\u4e0a\u89d2\u7684\u6301\u7eed\u5728\u7ebf\u52a8\u753b\uff1b\u4e0d\u5f71\u54cd\u56de\u590d\u9876\u90e8\u72b6\u6001\u6761\u3002";
      copy.append(title, description);

      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.setAttribute("role", "switch");
      switchButton.setAttribute("aria-label", "\u5de6\u4e0a\u89d2\u5728\u7ebf\u706f");
      switchButton.setAttribute("data-codex-online-core-switch", "true");
      const knob = document.createElement("span");
      knob.setAttribute("data-codex-online-core-knob", "true");
      switchButton.appendChild(knob);
      switchButton.addEventListener("click", () => {
        setOnlineCoreEnabled(!getOnlineCoreEnabled(), true);
        syncOnlineCoreControl(control);
      });
      control.append(copy, switchButton);
    }

    if (control.previousElementSibling !== indicatorControl) {
      indicatorControl.insertAdjacentElement("afterend", control);
    }
    syncOnlineCoreControl(control);
    return true;
  };

  const mountLiveActivityControl = (onlineCoreControl) => {
    if (!onlineCoreControl?.isConnected) return false;
    let control = document.querySelector('[data-codex-live-activity-control="true"]');
    if (!control) {
      control = document.createElement("div");
      control.setAttribute("data-codex-live-activity-control", "true");

      const copy = document.createElement("div");
      copy.setAttribute("data-codex-live-activity-copy", "true");
      const title = document.createElement("div");
      title.setAttribute("data-codex-live-activity-control-title", "true");
      title.textContent = "LIVE ACTIVITY";
      const description = document.createElement("div");
      description.setAttribute("data-codex-live-activity-control-description", "true");
      description.textContent = "\u5728\u4fa7\u680f\u663e\u793a\u5f53\u524d\u4efb\u52a1\u3001\u5de5\u5177\u4e0e Agent\uff1b\u914d\u8272\u53ea\u5f71\u54cd\u7ec6\u8fb9\u548c\u72b6\u6001\u70b9\u3002";
      copy.append(title, description);

      const actions = document.createElement("div");
      actions.setAttribute("data-codex-live-activity-actions", "true");
      const accents = document.createElement("div");
      accents.setAttribute("data-codex-live-activity-accent-options", "true");
      accents.setAttribute("role", "radiogroup");
      accents.setAttribute("aria-label", "LIVE ACTIVITY \u914d\u8272");
      for (const [value, label] of liveActivityAccentChoices) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.setAttribute("data-codex-live-activity-accent-value", value);
        button.setAttribute("aria-label", label);
        button.title = label;
        button.addEventListener("click", () => {
          setLiveActivityAccent(value, true);
          syncLiveActivityControl(control);
        });
        accents.appendChild(button);
      }
      actions.appendChild(accents);

      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.setAttribute("role", "switch");
      switchButton.setAttribute("aria-label", "\u542f\u7528 LIVE ACTIVITY");
      switchButton.setAttribute("data-codex-live-activity-switch", "true");
      const knob = document.createElement("span");
      knob.setAttribute("data-codex-live-activity-knob", "true");
      switchButton.appendChild(knob);
      switchButton.addEventListener("click", () => {
        setLiveActivityEnabled(!getLiveActivityEnabled(), true);
        refreshLiveActivity();
        syncLiveActivityControl(control);
      });
      actions.appendChild(switchButton);
      control.append(copy, actions);
    }

    if (control.previousElementSibling !== onlineCoreControl) {
      onlineCoreControl.insertAdjacentElement("afterend", control);
    }
    syncLiveActivityControl(control);
    return true;
  };

  const mountUsageGaugeControl = (liveActivityControl) => {
    if (!liveActivityControl?.isConnected) return false;
    let control = document.querySelector('[data-codex-usage-gauge-control="true"]');
    if (!control) {
      control = document.createElement("div");
      control.setAttribute("data-codex-usage-gauge-control", "true");

      const copy = document.createElement("div");
      copy.setAttribute("data-codex-usage-gauge-copy", "true");
      const title = document.createElement("div");
      title.setAttribute("data-codex-usage-gauge-control-title", "true");
      title.textContent = "额度仪表";
      const description = document.createElement("div");
      description.setAttribute("data-codex-usage-gauge-control-description", "true");
      description.textContent = "读取 Codex 原生用量缓存；状态档只显示电量格，点击后再显示精确百分比。";
      copy.append(title, description);

      const options = document.createElement("div");
      options.setAttribute("data-codex-usage-gauge-options", "true");
      options.setAttribute("role", "radiogroup");
      options.setAttribute("aria-label", "额度仪表显示方式");
      for (const [value, label] of [["off", "隐藏"], ["status", "状态"], ["precise", "精确"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.setAttribute("data-codex-usage-gauge-mode-value", value);
        button.textContent = label;
        button.addEventListener("click", () => {
          setUsageGaugeMode(value, true);
          refreshUsageGauge();
          syncUsageGaugeControl(control);
        });
        options.appendChild(button);
      }
      control.append(copy, options);
    }

    if (control.previousElementSibling !== liveActivityControl) {
      liveActivityControl.insertAdjacentElement("afterend", control);
    }
    syncUsageGaugeControl(control);
    return true;
  };

  const mountSurfaceControl = () => {
    const group = themeGroup();
    if (!group) return false;
    group.querySelector('[data-codex-surface-theme-card="true"]')?.remove();
    group.removeAttribute("data-codex-surface-theme-group");

    const nativeInputs = [...group.querySelectorAll('input[name="appearance-theme"]')];
    if (legacySurfaceWasActive && !nativeSelectionReconciled) {
      nativeSelectionReconciled = true;
      const selectedInput = nativeInputs.find((input) => input.checked);
      if (!selectedInput) {
        nativeInputs.find(isLightThemeInput)?.click();
      } else {
        const selectedLabel = selectedInput.getAttribute("aria-label") || "";
        const selectedIsDark = /^(\u6df1\u8272|Dark)$/i.test(selectedLabel);
        const selectedIsLight = /^(\u6d45\u8272|Light)$/i.test(selectedLabel);
        const rootIsDark = root.classList.contains("dark") || root.classList.contains("electron-dark");
        const selectionAndRootDisagree =
          (selectedIsDark && !rootIsDark) || (selectedIsLight && rootIsDark);
        if (selectionAndRootDisagree) {
          nativeInputs.find((input) => input !== selectedInput)?.click();
          schedule(() => {
            const freshInput = [...(themeGroup()?.querySelectorAll('input[name="appearance-theme"]') || [])]
              .find((input) => input.getAttribute("aria-label") === selectedLabel);
            freshInput?.click();
          }, 80);
        }
      }
    }

    let control = document.querySelector('[data-codex-surface-layout-control="true"]');
    if (!control) {
      control = document.createElement("div");
      control.setAttribute("data-codex-surface-layout-control", "true");

      const copy = document.createElement("div");
      copy.setAttribute("data-codex-surface-layout-copy", "true");
      const title = document.createElement("div");
      title.setAttribute("data-codex-surface-layout-title", "true");
      title.textContent = "Surface \u7ed3\u6784";
      const description = document.createElement("div");
      description.setAttribute("data-codex-surface-layout-description", "true");
      description.textContent = "\u4fdd\u7559\u60ac\u6d6e\u9762\u677f\u4e0e\u8f93\u5165\u6846\uff1bAssistant \u56de\u590d\u4fdd\u6301\u65e0\u5361\u7247\u3002";
      copy.append(title, description);

      const options = document.createElement("div");
      options.setAttribute("data-codex-surface-layout-options", "true");
      options.setAttribute("role", "radiogroup");
      options.setAttribute("aria-label", "Surface \u7ed3\u6784");
      for (const [value, label] of [["official", "\u539f\u7248"], [activeValue, "Surface"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.setAttribute("data-codex-surface-layout-value", value);
        button.textContent = label;
        button.addEventListener("click", () => {
          setSurfaceActive(value === activeValue, true);
          syncSurfaceControl(control);
        });
        options.appendChild(button);
      }
      control.append(copy, options);
    }

    if (control.previousElementSibling !== group) {
      group.insertAdjacentElement("afterend", control);
    }
    syncSurfaceControl(control);
    mountAssistantIndicatorControl(control);
    mountOnlineCoreControl(
      document.querySelector('[data-codex-assistant-indicator-control="true"]'),
    );
    mountLiveActivityControl(
      document.querySelector('[data-codex-online-core-control="true"]'),
    );
    mountUsageGaugeControl(
      document.querySelector('[data-codex-live-activity-control="true"]'),
    );
    return true;
  };

  const onDocumentClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(".app-shell-left-panel")) {
      schedule(mountProjectColors, 40);
      schedule(mountProjectColors, 180);
    }
    const nativeThemeInput = target.closest("label")?.querySelector('input[name="appearance-theme"]');
    if (nativeThemeInput || target.closest('[data-settings-panel-slug="appearance"], [role="dialog"], [role="menuitem"]')) {
      schedule(mountSurfaceControl, 60);
      schedule(mountSurfaceControl, 240);
      schedule(mountSurfaceControl, 650);
    }
  };
  const onDocumentChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "appearance-theme") return;
    schedule(mountSurfaceControl, 80);
    schedule(mountSurfaceControl, 320);
  };
  const onDocumentKeyDown = (event) => {
    if (event.key === "Escape") {
      closeProjectColorPopover();
      closeContextAccentPopover();
      closeUsageGaugePopover();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === ",") {
      schedule(mountSurfaceControl, 180);
      schedule(mountSurfaceControl, 600);
    }
  };
  const onProjectContextMenu = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest(projectRowSelector);
    if (!row || !row.closest(".app-shell-left-panel") || target.closest("button, a, input")) return;
    event.preventDefault();
    event.stopPropagation();
    openProjectColorPopover(row, event.clientX, event.clientY);
  };
  const onProjectPointerDown = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (projectColorPopover && !projectColorPopover.hidden && !projectColorPopover.contains(target)) {
      closeProjectColorPopover();
    }
    if (contextAccentPopover && !contextAccentPopover.hidden && !contextAccentPopover.contains(target)) {
      const contextButton = target?.closest('[data-codex-context-widget="true"]');
      if (!contextButton) closeContextAccentPopover();
    }
    if (usageGaugePopover && !usageGaugePopover.hidden && !usageGaugePopover.contains(target)) {
      const usageButton = target?.closest(usageGaugeSelector);
      if (!usageButton) closeUsageGaugePopover();
    }
  };
  const onProjectViewportChange = (event) => {
    if (event?.type === "scroll") {
      const target = event.target instanceof Element ? event.target : null;
      if (target && !target.closest(".app-shell-left-panel")) return;
    }
    closeProjectColorPopover();
    closeContextAccentPopover();
    closeUsageGaugePopover();
  };

  document.addEventListener("change", onDocumentChange, true);
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  document.addEventListener("contextmenu", onProjectContextMenu, true);
  document.addEventListener("pointerdown", onProjectPointerDown, true);
  document.addEventListener("scroll", onProjectViewportChange, true);
  window.addEventListener("resize", onProjectViewportChange, true);
  const controller = {
    mount() {
      const surfaceMounted = mountSurfaceControl();
      mountProjectColors();
      mountOnlineCore();
      refreshStatusWidgets();
      return surfaceMounted;
    },
    setSurfaceActive(active, persist = true) {
      setSurfaceActive(active, persist);
      const control = document.querySelector('[data-codex-surface-layout-control="true"]');
      if (control) syncSurfaceControl(control);
    },
    setAssistantIndicator(value, persist = true) {
      setAssistantIndicator(value, persist);
      const control = document.querySelector('[data-codex-assistant-indicator-control="true"]');
      if (control) syncAssistantIndicatorControl(control);
    },
    setAssistantIndicatorEnabled(enabled, persist = true) {
      setAssistantIndicatorEnabled(enabled, persist);
      const indicatorControl = document.querySelector('[data-codex-assistant-indicator-control="true"]');
      if (indicatorControl) syncAssistantIndicatorControl(indicatorControl);
    },
    setOnlineCoreEnabled(enabled, persist = true) {
      setOnlineCoreEnabled(enabled, persist);
      const control = document.querySelector('[data-codex-online-core-control="true"]');
      if (control) syncOnlineCoreControl(control);
    },
    // Compatibility seam for the frozen 1.2/1.3 QA commands. Placement now
    // maps only to Online Core visibility and never gates the response rail.
    setAssistantIndicatorPlacement(value, persist = true) {
      setAssistantIndicatorPlacement(value, persist);
      const control = document.querySelector('[data-codex-online-core-control="true"]');
      if (control) syncOnlineCoreControl(control);
    },
    setOnlineCoreState(value = "auto") {
      return setOnlineCoreState(value);
    },
    setProjectColor(projectId, colorId) {
      setProjectColorById(projectId, colorId);
    },
    setContextAccent(value, persist = true) {
      return setContextAccent(value, persist);
    },
    refreshContextWidget() {
      return refreshContextWidget();
    },
    refreshLiveActivity() {
      return refreshLiveActivity();
    },
    refreshUsageGauge() {
      return refreshUsageGauge();
    },
    getUsageGaugeStatus() {
      return getCurrentRateLimitStatus();
    },
    setLiveActivityEnabled(enabled, persist = true) {
      const nextValue = setLiveActivityEnabled(enabled, persist);
      refreshLiveActivity();
      const control = document.querySelector('[data-codex-live-activity-control="true"]');
      if (control) syncLiveActivityControl(control);
      return nextValue;
    },
    setLiveActivityAccent(value, persist = true) {
      const nextValue = setLiveActivityAccent(value, persist);
      const control = document.querySelector('[data-codex-live-activity-control="true"]');
      if (control) syncLiveActivityControl(control);
      return nextValue;
    },
    setLiveActivityState(value = "auto") {
      return setLiveActivityState(value);
    },
    setUsageGaugeMode(value, persist = true) {
      const nextValue = setUsageGaugeMode(value, persist);
      refreshUsageGauge();
      const control = document.querySelector('[data-codex-usage-gauge-control="true"]');
      if (control) syncUsageGaugeControl(control);
      return nextValue;
    },
    destroy() {
      document.removeEventListener("change", onDocumentChange, true);
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      document.removeEventListener("contextmenu", onProjectContextMenu, true);
      document.removeEventListener("pointerdown", onProjectPointerDown, true);
      document.removeEventListener("scroll", onProjectViewportChange, true);
      window.removeEventListener("resize", onProjectViewportChange, true);
      statusWidgetLoopActive = false;
      projectColorObserver?.disconnect();
      projectColorObserver = null;
      projectColorObservedSidebar = null;
      onlineCoreActivityObserver?.disconnect();
      onlineCoreActivityObserver = null;
      onlineCoreObservedBody = null;
      startupHydrationStopped = true;
      startupHydrationObserver?.disconnect();
      startupHydrationObserver = null;
      startupHydrationRefreshQueued = false;
      destroyVoxOscilloscopes();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      projectColorPopover?.remove();
      projectColorPopover = null;
      contextAccentPopover?.remove();
      contextAccentPopover = null;
      usageGaugePopover?.remove();
      usageGaugePopover = null;
      document.querySelector(liveActivitySelector)?.remove();
      document.querySelector(usageGaugeSelector)?.remove();
      for (const widget of document.querySelectorAll(contextWidgetSelector)) cleanupContextWidget(widget);
      conversationStoreCache = null;
      rateLimitQueryClientCache = null;
      for (const row of document.querySelectorAll("[" + projectColorAttribute + "]")) {
        row.removeAttribute(projectColorAttribute);
      }
      for (const node of document.querySelectorAll(
        "[" + projectGridAttribute + "], [" + projectGridItemAttribute + "], [" + projectCardAttribute + "]",
      )) {
        node.removeAttribute(projectGridAttribute);
        node.removeAttribute(projectGridItemAttribute);
        node.removeAttribute(projectCardAttribute);
        node.removeAttribute(projectExpandedAttribute);
      }
      for (const icon of document.querySelectorAll(
        "[" + projectIconAttribute + "], [" + threadIconAttribute + "]",
      )) icon.remove();
      projectIconTemplates = null;
      threadIconTemplate = null;
      document.querySelector(onlineCoreSelector)?.remove();
      root.removeAttribute("data-codex-online-core-state");
      root.removeAttribute("data-codex-online-core-enabled");
      root.removeAttribute("data-codex-context-source");
      root.removeAttribute("data-codex-context-percent");
      root.removeAttribute("data-codex-context-accent");
      root.removeAttribute("data-codex-live-activity-source");
      root.removeAttribute("data-codex-live-subtask-total");
      root.removeAttribute("data-codex-live-subtask-done");
      root.removeAttribute("data-codex-live-observed-events");
      root.removeAttribute("data-codex-live-stage");
      root.removeAttribute("data-codex-live-activity-enabled");
      root.removeAttribute("data-codex-live-activity-accent");
      root.removeAttribute("data-codex-assistant-indicator-enabled");
      root.removeAttribute("data-codex-assistant-indicator-placement");
      root.removeAttribute("data-codex-vox-running");
      root.removeAttribute("data-codex-usage-gauge-mode");
      root.removeAttribute("data-codex-usage-source");
      root.removeAttribute("data-codex-usage-remaining");
      root.removeAttribute("data-codex-startup-sync");
      document.querySelector('[data-codex-surface-layout-control="true"]')?.remove();
      document.querySelector('[data-codex-assistant-indicator-control="true"]')?.remove();
      document.querySelector('[data-codex-online-core-control="true"]')?.remove();
      document.querySelector('[data-codex-live-activity-control="true"]')?.remove();
      document.querySelector('[data-codex-usage-gauge-control="true"]')?.remove();
      document.querySelector('[data-codex-assistant-placement-control="true"]')?.remove();
      document.querySelector('[data-codex-surface-theme-card="true"]')?.remove();
      document.querySelector('[data-codex-surface-theme-group="true"]')?.removeAttribute("data-codex-surface-theme-group");
      delete globalThis[controllerKey];
      delete globalThis[legacyControllerKey];
    },
  };
  globalThis[controllerKey] = controller;
  globalThis[legacyControllerKey] = controller;
  ensureStartupHydrationObserver();
  mountSurfaceControl();
  mountProjectColors();
  mountOnlineCore();
  setContextAccent(getContextAccent(), false);
  refreshStatusWidgets();
  scheduleStatusWidgetHeartbeat();
  schedule(mountSurfaceControl, 180);
  schedule(mountSurfaceControl, 650);
  schedule(mountProjectColors, 180);
  schedule(mountProjectColors, 650);
  schedule(mountOnlineCore, 180);
  schedule(mountOnlineCore, 650);
  schedule(refreshStatusWidgets, 180);
  schedule(refreshStatusWidgets, 650);

  return {
    applied: true,
    activeLayout: root.getAttribute("data-codex-surface-layout") || "official",
    assistantIndicator: root.getAttribute("data-codex-assistant-indicator") || "rider",
    assistantIndicatorEnabled: root.getAttribute("data-codex-assistant-indicator-enabled") !== "false",
    assistantIndicatorPlacement: root.getAttribute("data-codex-assistant-indicator-placement") || "corner",
    onlineCoreEnabled: root.getAttribute("data-codex-online-core-enabled") !== "false",
    settingsIntegrated: Boolean(themeGroup()),
    projectColorsIntegrated: document.querySelectorAll(projectRowSelector + "[" + projectColorAttribute + "]").length,
    projectCardsIntegrated: document.querySelectorAll("[" + projectCardAttribute + "]").length,
    threadIconsIntegrated: document.querySelectorAll("[" + threadIconAttribute + "]").length,
    onlineCoreIntegrated: Boolean(document.querySelector(onlineCoreSelector)),
    onlineCoreState: root.getAttribute("data-codex-online-core-state") || null,
    liveActivityIntegrated: Boolean(document.querySelector(liveActivitySelector)),
    liveActivityEnabled: root.getAttribute("data-codex-live-activity-enabled") !== "false",
    liveActivityAccent: root.getAttribute("data-codex-live-activity-accent") || "violet",
    liveActivityControlMounted: Boolean(document.querySelector('[data-codex-live-activity-control="true"]')),
    liveActivitySource: root.getAttribute("data-codex-live-activity-source") || null,
    liveActivityObservedEvents: root.hasAttribute("data-codex-live-observed-events")
      ? Number(root.getAttribute("data-codex-live-observed-events"))
      : null,
    liveActivityStage: root.hasAttribute("data-codex-live-stage")
      ? Number(root.getAttribute("data-codex-live-stage"))
      : null,
    usageGaugeMode: root.getAttribute("data-codex-usage-gauge-mode") || "status",
    usageGaugeIntegrated: Boolean(document.querySelector(usageGaugeSelector)),
    usageRemaining: root.hasAttribute("data-codex-usage-remaining")
      ? Number(root.getAttribute("data-codex-usage-remaining"))
      : null,
    usageSource: root.getAttribute("data-codex-usage-source") || null,
    contextInComposer: Boolean(document.querySelector(contextWidgetSelector)?.closest("[data-composer-surface-variant]")),
    contextPercent: root.hasAttribute("data-codex-context-percent")
      ? Number(root.getAttribute("data-codex-context-percent"))
      : null,
    contextSource: root.getAttribute("data-codex-context-source") || null,
    contextAccent: root.getAttribute("data-codex-context-accent") || null,
    startupSync: root.getAttribute("data-codex-startup-sync") || null,
    voxCanvasCount: document.querySelectorAll(voxCanvasSelector).length,
    voxCanvasRunning: root.getAttribute("data-codex-vox-running") === "true",
    href: location.href,
  };
})()`;
}

const removeExpression = `(() => {
  const root = document.documentElement;
  const styleIds = ${JSON.stringify([styleId, ...legacyStyleIds])};
  const storageKey = "codex.surface-layout.v2";
  const legacyStorageKey = "codex.surface-theme.v1";
  globalThis.__codexSurfaceLayoutController?.destroy?.();
  delete globalThis.__codexSurfaceLayoutController;
  globalThis.__codexSurfaceThemeController?.destroy?.();
  delete globalThis.__codexSurfaceThemeController;
  globalThis.__codexSkinThemeObserver?.disconnect();
  delete globalThis.__codexSkinThemeObserver;
  if (globalThis.__codexSkinWallpaperObjectUrl) {
    URL.revokeObjectURL(globalThis.__codexSkinWallpaperObjectUrl);
    delete globalThis.__codexSkinWallpaperObjectUrl;
  }
  root.style.removeProperty("--frost-wallpaper-image");
  for (const id of styleIds) document.getElementById(id)?.remove();
  if (location.href === "app://-/index.html") {
    try {
      localStorage.setItem(storageKey, "official");
      localStorage.setItem(legacyStorageKey, "official");
    } catch {}
  }
  root.removeAttribute("data-codex-surface-layout");
  root.removeAttribute("data-codex-surface-theme");
  root.removeAttribute("data-codex-user-skin-theme-state");
  root.removeAttribute("data-codex-user-skin");
  root.removeAttribute("data-codex-wallpaper");
  root.removeAttribute("data-codex-background-mode");
  root.removeAttribute("data-codex-panel-layout");
  root.removeAttribute("data-codex-panel-shadow");
  root.removeAttribute("data-codex-color-glow");
  root.removeAttribute("data-codex-assistant-surface");
  root.removeAttribute("data-codex-assistant-indicator");
  root.removeAttribute("data-codex-assistant-indicator-enabled");
  root.removeAttribute("data-codex-assistant-indicator-placement");
  root.removeAttribute("data-codex-online-core-enabled");
  root.removeAttribute("data-codex-online-core-state");
  root.removeAttribute("data-codex-context-source");
  root.removeAttribute("data-codex-context-percent");
  root.removeAttribute("data-codex-context-accent");
  root.removeAttribute("data-codex-live-activity-source");
  root.removeAttribute("data-codex-live-subtask-total");
  root.removeAttribute("data-codex-live-subtask-done");
  root.removeAttribute("data-codex-live-observed-events");
  root.removeAttribute("data-codex-live-stage");
  root.removeAttribute("data-codex-live-activity-enabled");
  root.removeAttribute("data-codex-live-activity-accent");
  root.removeAttribute("data-codex-usage-gauge-mode");
  root.removeAttribute("data-codex-usage-source");
  root.removeAttribute("data-codex-usage-remaining");
  root.removeAttribute("data-codex-startup-sync");
  document.querySelector('[data-codex-footer-telemetry="true"]')?.remove();
  document.querySelector('[data-codex-live-activity="true"]')?.remove();
  document.querySelector('[data-codex-live-activity-control="true"]')?.remove();
  document.querySelector('[data-codex-usage-gauge="true"]')?.remove();
  document.querySelector('[data-codex-usage-gauge-popover="true"]')?.remove();
  document.querySelector('[data-codex-usage-gauge-control="true"]')?.remove();
  for (const widget of document.querySelectorAll('[data-codex-context-widget="true"]')) {
    widget.removeAttribute("data-codex-context-widget");
    widget.removeAttribute("role");
    widget.removeAttribute("tabindex");
    widget.removeAttribute("aria-haspopup");
    widget.removeAttribute("title");
  }
  document.querySelector('[data-codex-context-accent-popover="true"]')?.remove();
  return { removed: true, href: location.href };
})()`;

const statusExpression = `(() => {
  const root = document.documentElement;
  const styleIds = ${JSON.stringify([styleId, ...legacyStyleIds])};
  return {
    installed: styleIds.some((id) => Boolean(document.getElementById(id))),
    activeStyleId: styleIds.find((id) => Boolean(document.getElementById(id))) || null,
    activeLayout: root.getAttribute("data-codex-surface-layout") || "official",
    assistantIndicator: root.getAttribute("data-codex-assistant-indicator") || null,
    assistantIndicatorEnabled: root.getAttribute("data-codex-assistant-indicator-enabled") !== "false",
    assistantIndicatorPlacement: root.getAttribute("data-codex-assistant-indicator-placement") || null,
    onlineCoreEnabled: root.getAttribute("data-codex-online-core-enabled") !== "false",
    onlineCoreIntegrated: Boolean(document.querySelector('[data-codex-online-core="true"]')),
    onlineCoreState: root.getAttribute("data-codex-online-core-state") || null,
    liveActivityIntegrated: Boolean(document.querySelector('[data-codex-live-activity="true"]')),
    liveActivityEnabled: root.getAttribute("data-codex-live-activity-enabled") !== "false",
    liveActivityAccent: root.getAttribute("data-codex-live-activity-accent") || null,
    liveActivityControlMounted: Boolean(document.querySelector('[data-codex-live-activity-control="true"]')),
    liveActivitySource: root.getAttribute("data-codex-live-activity-source") || null,
    liveActivityObservedEvents: root.hasAttribute("data-codex-live-observed-events")
      ? Number(root.getAttribute("data-codex-live-observed-events"))
      : null,
    liveActivityStage: root.hasAttribute("data-codex-live-stage")
      ? Number(root.getAttribute("data-codex-live-stage"))
      : null,
    usageGaugeMode: root.getAttribute("data-codex-usage-gauge-mode") || null,
    usageGaugeIntegrated: Boolean(document.querySelector('[data-codex-usage-gauge="true"]')),
    usageRemaining: root.hasAttribute("data-codex-usage-remaining")
      ? Number(root.getAttribute("data-codex-usage-remaining"))
      : null,
    usageSource: root.getAttribute("data-codex-usage-source") || null,
    liveSubtaskTotal: root.hasAttribute("data-codex-live-subtask-total")
      ? Number(root.getAttribute("data-codex-live-subtask-total"))
      : null,
    liveSubtaskDone: root.hasAttribute("data-codex-live-subtask-done")
      ? Number(root.getAttribute("data-codex-live-subtask-done"))
      : null,
    contextInComposer: Boolean(document.querySelector('[data-codex-context-widget="true"]')?.closest('[data-composer-surface-variant]')),
    contextPercent: root.hasAttribute("data-codex-context-percent")
      ? Number(root.getAttribute("data-codex-context-percent"))
      : null,
    contextSource: root.getAttribute("data-codex-context-source") || null,
    contextAccent: root.getAttribute("data-codex-context-accent") || null,
    startupSync: root.getAttribute("data-codex-startup-sync") || null,
    voxCanvasCount: document.querySelectorAll('[data-codex-vox-canvas="true"]').length,
    voxCanvasRunning: root.getAttribute("data-codex-vox-running") === "true",
    controllerReady: Boolean(globalThis.__codexSurfaceLayoutController),
    appearanceControlsMounted: Boolean(document.querySelector('[data-codex-surface-layout-control="true"]')),
    assistantIndicatorControlMounted: Boolean(document.querySelector('[data-codex-assistant-indicator-control="true"]')),
    assistantPlacementControlMounted: Boolean(document.querySelector('[data-codex-online-core-control="true"]')),
    onlineCoreControlMounted: Boolean(document.querySelector('[data-codex-online-core-control="true"]')),
    usageGaugeControlMounted: Boolean(document.querySelector('[data-codex-usage-gauge-control="true"]')),
    settingsIntegrated: Boolean(document.querySelector('[data-codex-surface-layout-control="true"]')),
    projectColorsIntegrated: document.querySelectorAll('[data-app-action-sidebar-project-row][data-codex-project-color]').length,
    projectCardsIntegrated: document.querySelectorAll('[data-codex-project-card="true"]').length,
    threadIconsIntegrated: document.querySelectorAll('[data-codex-thread-icon="true"]').length,
    href: location.href,
  };
})()`;

const diagnoseExpression = `(() => {
  const checks = [
    ["主题样式", "#${styleId}", true],
    ["侧栏", ".app-shell-left-panel, .bg-token-side-bar-background", true],
    ["主工作区", "[data-app-shell-main-surface]", true],
    ["输入框", "[data-composer-surface-variant]", true],
    ["Assistant 完成态", "[data-local-conversation-final-assistant='true']", false],
    ["Assistant 回复根", "[data-content-search-turn-key] > div > div:last-child:has([data-markdown-text-style='assistant-message'])", false],
    ["顶部栏", "header[data-app-shell-application-menu-bar='true'], [class*='_ApplicationMenuTopBar_']", true],
    ["权限框", "[data-codex-approval-surface]", false],
    ["弹出菜单", "[role='dialog'], [role='menu'], [data-radix-popper-content-wrapper]", false],
    ["右侧审查栏", "[data-browser-sidebar-webview][data-app-shell-focus-area='right-panel']", false],
    ["终端标签", "[role='tab']", false],
    ["代码 Diff", "[class*='group/turn-diff-header'], [class~='group/file-diff']", false],
  ];
  return checks.map(([name, selector, required]) => ({
    name,
    selector,
    required,
    count: document.querySelectorAll(selector).length,
  }));
})()`;

function getSessionExpression() {
  if (mode === "remove") return removeExpression;
  if (mode === "diagnose") return diagnoseExpression;
  if (mode === "status") return statusExpression;
  return buildApplyExpression();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSkinSourceSignature() {
  return [
    cssPath,
    configPath,
    tuningPath,
    previewConfigPath,
    path.join(here, "background.jpg"),
    path.join(here, "assets", "assistant-electric-arc-sprite.svg"),
    ...Object.values(projectIconAssetFiles).map((fileName) =>
      path.join(projectIconAssetDirectory, fileName)),
    previewBackgroundPath,
  ]
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return `${filePath}:${stat.size}:${stat.mtimeMs}`;
      } catch {
        return `${filePath}:missing`;
      }
    })
    .join("|");
}

async function listPageTargets() {
  const response = await fetch(`http://${host}:${port}/json/list`, {
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
  const targets = await response.json();
  return targets.filter(
    (target) =>
      target.type === "page" &&
      typeof target.webSocketDebuggerUrl === "string" &&
      !String(target.url || "").startsWith("devtools://"),
  );
}

function isCodexMainRenderer(target) {
  return String(target.url || "") === "app://-/index.html";
}

async function listTargets() {
  const targets = await listPageTargets();
  return targets.filter(isCodexMainRenderer);
}

class CdpSession {
  constructor(target, sessionExpression = getSessionExpression) {
    this.target = target;
    this.sessionExpression = sessionExpression;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.injectTimer = null;
  }

  async connect() {
    const socket = new WebSocket(this.target.webSocketDebuggerUrl);
    this.socket = socket;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("WebSocket connection failed"));
      });
    });

    socket.addEventListener("message", (event) => this.onMessage(event));
    socket.addEventListener("close", () => this.onClose());
    socket.addEventListener("error", () => this.onClose());

    await this.call("Runtime.enable");
    await this.call("Page.enable");
    await this.inject();
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timeoutId } = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(timeoutId);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }

    if (
      message.method === "Page.frameNavigated" &&
      !message.params?.frame?.parentId
    ) {
      clearTimeout(this.injectTimer);
      this.injectTimer = setTimeout(() => {
        this.inject().catch((error) =>
          log(`Re-injection failed for ${this.target.id}: ${error.message}`),
        );
      }, 250);
    }
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.injectTimer);
    for (const { reject, timeoutId } of this.pending.values()) {
      clearTimeout(timeoutId);
      reject(new Error("CDP session closed"));
    }
    this.pending.clear();
  }

  call(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP socket is not open"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeoutId });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async inject() {
    const expression = typeof this.sessionExpression === "function"
      ? this.sessionExpression()
      : this.sessionExpression;
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Runtime evaluation failed",
      );
    }
    return result?.result?.value;
  }

  close() {
    this.closed = true;
    clearTimeout(this.injectTimer);
    try {
      this.socket?.close();
    } catch {
      // The browser may already have closed the target.
    }
  }
}

async function connectTarget(target, sessionExpression = getSessionExpression) {
  const session = new CdpSession(target, sessionExpression);
  try {
    await session.connect();
    return session;
  } catch (error) {
    session.close();
    throw error;
  }
}

async function removeSkinFromExternalPages() {
  const targets = (await listPageTargets()).filter(
    (target) => !isCodexMainRenderer(target),
  );
  for (const target of targets) {
    let session;
    try {
      session = await connectTarget(target, removeExpression);
    } finally {
      session?.close();
    }
  }
}

async function waitForTargets() {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets();
      if (targets.length > 0) return targets;
    } catch (error) {
      lastError = error;
    }
    await delay(350);
  }
  throw new Error(
    `No debuggable Codex page appeared on ${host}:${port}` +
      (lastError ? ` (${lastError.message})` : ""),
  );
}

async function runOnce() {
  const targets = await waitForTargets();
  let success = 0;
  for (const target of targets) {
    let session;
    try {
      session = await connectTarget(target);
      if (mode === "diagnose") {
        const checks = await session.call("Runtime.evaluate", {
          expression: diagnoseExpression,
          awaitPromise: true,
          returnByValue: true,
        });
        const values = checks?.result?.value || [];
        for (const check of values) {
          const state = check.count > 0 ? "OK" : check.required ? "WARN" : "ABSENT";
          process.stdout.write(`DIAG|${state}|${check.name}|${check.count}|${check.selector}\n`);
        }
      } else if (mode === "status") {
        const status = await session.call("Runtime.evaluate", {
          expression: statusExpression,
          awaitPromise: true,
          returnByValue: true,
        });
        process.stdout.write(`STATUS_JSON=${JSON.stringify(status?.result?.value || {})}\n`);
      }
      success += 1;
    } finally {
      session?.close();
    }
  }
  if (success === 0) throw new Error("No Codex renderer accepted the skin");
  const action = mode === "remove"
    ? "Removed theme from"
    : mode === "status"
      ? "Read theme status from"
      : mode === "diagnose"
        ? "Diagnosed theme on"
        : "Applied theme to";
  log(`${action} ${success} page(s).`);
}

async function runWatch() {
  await waitForTargets();
  const sessions = new Map();
  let stopping = false;
  let disconnectedSince = null;
  let skinSourceSignature = getSkinSourceSignature();

  const stop = () => {
    stopping = true;
    for (const session of sessions.values()) session.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    try {
      discardStalePreview();
      const targets = await listTargets();
      if (targets.length > 0) {
        disconnectedSince = null;
      } else if (disconnectedSince === null) {
        disconnectedSince = Date.now();
      }
      const liveIds = new Set(targets.map((target) => target.id));

      for (const [id, session] of sessions) {
        if (!liveIds.has(id) || session.closed) {
          session.close();
          sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (sessions.has(target.id)) continue;
        try {
          const session = await connectTarget(target);
          sessions.set(target.id, session);
          log(`Skin attached to renderer ${target.id}.`);
          reportReady(target);
        } catch (error) {
          log(`Could not attach to renderer ${target.id}: ${error.message}`);
        }
      }

      const nextSkinSourceSignature = getSkinSourceSignature();
      if (
        sessions.size > 0 &&
        !fs.existsSync(liveRefreshPausePath) &&
        nextSkinSourceSignature !== skinSourceSignature
      ) {
        let reloadSucceeded = true;
        for (const [id, session] of sessions) {
          try {
            await session.inject();
          } catch (error) {
            reloadSucceeded = false;
            log(`Skin source reload failed for ${id}: ${error.message}`);
          }
        }
        if (reloadSucceeded) {
          skinSourceSignature = nextSkinSourceSignature;
          log(`Skin sources changed; reloaded ${sessions.size} renderer(s).`);
        }
      }
    } catch (error) {
      if (disconnectedSince === null) {
        disconnectedSince = Date.now();
        if (!stopping) log(`Codex connection closed: ${error.message}`);
      }
    }

    if (disconnectedSince !== null && Date.now() - disconnectedSince > 15000) {
      log("Codex stayed closed for 15 seconds; stopping the skin watcher.");
      stop();
      break;
    }
    await delay(previewIsActive() ? 260 : 2500);
  }
}

try {
  if (mode === "watch") await runWatch();
  else await runOnce();
} catch (error) {
  log(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
