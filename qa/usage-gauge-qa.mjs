import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2]);
const outputDir = path.resolve(process.argv[3] || "qa/artifacts/usage-gauge");
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node qa/usage-gauge-qa.mjs <debug-port> [output-dir]");
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((candidate) => candidate.type === "page" && candidate.url === "app://-/index.html");
if (!target) throw new Error("Codex renderer not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP connection timed out")), 5000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || "Runtime evaluation failed");
  }
  return response.result.value;
};
const clickCenter = async (rect) => {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
const capture = async (name, clip) => {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale: 1 },
  });
  const targetPath = path.join(outputDir, name);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.from(screenshot.data, "base64"));
  return targetPath;
};

const returnedFromSettings = await evaluate(`(() => {
  const button = [...document.querySelectorAll('body *')]
    .filter((node) => /(?:\u8fd4\u56de\u5e94\u7528|Back to app)/i.test((node.textContent || '').replace(/\s+/g, ' ').trim()))
    .sort((left, right) => (left.textContent || '').length - (right.textContent || '').length)[0];
  if (!button) return false;
  (button.closest('button, a, [role="button"]') || button).click();
  return true;
})()`);
if (returnedFromSettings) await new Promise((resolve) => setTimeout(resolve, 600));

await evaluate(`globalThis.__codexSurfaceLayoutController?.refreshUsageGauge?.(); true`);
await new Promise((resolve) => setTimeout(resolve, 100));

const initial = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const gauge = document.querySelector('[data-codex-usage-gauge="true"]');
  const profile = document.querySelector('button[aria-label="\u6253\u5f00\u4e2a\u4eba\u8d44\u6599\u83dc\u5355"], button[aria-label="Open profile menu"]');
  const help = document.querySelector('button[aria-label="\u6253\u5f00\u5e2e\u52a9\u83dc\u5355"], button[aria-label="Open help menu"]');
  const sidebar = document.querySelector('.app-shell-left-panel');
  const status = controller?.getUsageGaugeStatus?.() || null;
  const rectOf = (node) => {
    const rect = node?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null;
  };
  const style = gauge ? getComputedStyle(gauge) : null;
  return {
    mode: document.documentElement.getAttribute('data-codex-usage-gauge-mode'),
    source: document.documentElement.getAttribute('data-codex-usage-source'),
    remaining: Number(document.documentElement.getAttribute('data-codex-usage-remaining')),
    status,
    gaugeCount: document.querySelectorAll('[data-codex-usage-gauge="true"]').length,
    popoverCount: document.querySelectorAll('[data-codex-usage-gauge-popover="true"]').length,
    cells: gauge?.querySelectorAll('[data-codex-usage-gauge-cell]').length || 0,
    activeCells: gauge?.querySelectorAll('[data-codex-usage-gauge-cell][data-active]').length || 0,
    gaugeRect: rectOf(gauge),
    profileRect: rectOf(profile),
    helpRect: rectOf(help),
    sidebarRect: rectOf(sidebar),
    profileIntact: Boolean(profile),
    helpIntact: Boolean(help),
    noAnimation: style?.animationName === 'none',
    noBlur: style?.filter === 'none' && style?.backdropFilter === 'none',
    background: style?.backgroundColor || null,
    borderStyle: style?.borderStyle || null,
    boxShadow: style?.boxShadow || null,
    borderRadius: style?.borderRadius || null,
  };
})()`);

const footerClip = {
  x: Math.max(0, Math.floor(initial.sidebarRect.x)),
  y: Math.max(0, Math.floor(initial.gaugeRect.y - 10)),
  width: Math.ceil(initial.sidebarRect.width),
  height: Math.ceil(initial.gaugeRect.height + 20),
};
const closedScreenshot = await capture("footer-status.png", footerClip);

await clickCenter(initial.gaugeRect);
await new Promise((resolve) => setTimeout(resolve, 120));
const open = await evaluate(`(() => {
  const popover = document.querySelector('[data-codex-usage-gauge-popover="true"]');
  const gauge = document.querySelector('[data-codex-usage-gauge="true"]');
  const rect = popover?.getBoundingClientRect();
  const style = popover ? getComputedStyle(popover) : null;
  return {
    visible: Boolean(popover && !popover.hidden && rect.width > 0 && rect.height > 0),
    rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
    exactText: popover?.querySelector('[data-codex-usage-popover-number="true"]')?.textContent || null,
    rows: [...(popover?.querySelectorAll('[data-codex-usage-popover-row="true"]') || [])].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
    expanded: gauge?.getAttribute('aria-expanded') === 'true',
    noAnimation: style?.animationName === 'none',
    noBackdropBlur: style?.backdropFilter === 'none',
    background: style?.backgroundColor || null,
  };
})()`);
const popoverClip = {
  x: Math.max(0, Math.floor(Math.min(open.rect.x - 10, initial.sidebarRect.x))),
  y: Math.max(0, Math.floor(open.rect.y - 10)),
  width: Math.ceil(Math.max(open.rect.right, initial.sidebarRect.right) - Math.max(0, Math.min(open.rect.x - 10, initial.sidebarRect.x))),
  height: Math.ceil(initial.gaugeRect.bottom - Math.max(0, open.rect.y - 10) + 10),
};
const openScreenshot = await capture("footer-popover.png", popoverClip);

await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
await new Promise((resolve) => setTimeout(resolve, 60));

const modes = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const original = document.documentElement.getAttribute('data-codex-usage-gauge-mode') || 'status';
  controller.setUsageGaugeMode('off', false);
  const offRemoved = !document.querySelector('[data-codex-usage-gauge="true"]');
  controller.setUsageGaugeMode('status', false);
  const statusGauge = document.querySelector('[data-codex-usage-gauge="true"]');
  const statusValueHidden = statusGauge && getComputedStyle(statusGauge.querySelector('[data-codex-usage-gauge-value="true"]')).display === 'none';
  controller.setUsageGaugeMode('precise', false);
  const preciseGauge = document.querySelector('[data-codex-usage-gauge="true"]');
  const preciseValueVisible = preciseGauge && getComputedStyle(preciseGauge.querySelector('[data-codex-usage-gauge-value="true"]')).display !== 'none';
  controller.setUsageGaugeMode(original, false);
  return { original, offRemoved, statusValueHidden, preciseValueVisible };
})()`);

const refreshed = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.refreshUsageGauge();
  const profile = document.querySelector('button[aria-label="\u6253\u5f00\u4e2a\u4eba\u8d44\u6599\u83dc\u5355"], button[aria-label="Open profile menu"]');
  const rect = profile.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()`);
await clickCenter(refreshed);
await new Promise((resolve) => setTimeout(resolve, 120));
const profileMenu = await evaluate(`(() => ({
  opened: Boolean(document.querySelector('[role="menu"]')),
  hasRemainingUsage: [...document.querySelectorAll('[role="menuitem"], [role="menu"] button')].some((node) => /(?:\u4f7f\u7528\u60c5\u51b5|\u5269\u4f59\u7528\u91cf|Usage|Remaining usage)/i.test((node.textContent || '').replace(/\s+/g, ' ').trim())),
}))()`);
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);

const expectedRemaining = initial.status?.available
  ? initial.status.limitingBucket.remainingPercent
  : null;
const isOpaqueDark = (value) => {
  const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  const channels = values.slice(0, 3);
  const alpha = values.length > 3 ? values[3] : 1;
  return channels.length === 3 && Math.max(...channels) <= 64 && alpha >= 0.94;
};
const checks = {
  sourceIsNativeQueryCache: initial.source === "rate-limit-query-cache",
  exactRemainingMatches: Number.isFinite(expectedRemaining) && initial.remaining === expectedRemaining,
  singleGauge: initial.gaugeCount === 1,
  fiveCells: initial.cells === 5,
  gaugeInsideSidebar: initial.gaugeRect.x >= initial.sidebarRect.x && initial.gaugeRect.right <= initial.sidebarRect.right,
  nativeProfileControlIntact: initial.profileIntact,
  staticGauge: initial.noAnimation && initial.noBlur,
  flatGauge: initial.background === "rgba(0, 0, 0, 0)" && initial.borderStyle === "none" && initial.boxShadow === "none",
  popoverOpens: open.visible && open.expanded,
  popoverExactValue: open.exactText === String(expectedRemaining),
  popoverStaticAndOpaqueDark: open.noAnimation && open.noBackdropBlur && isOpaqueDark(open.background),
  independentModes: modes.offRemoved && modes.statusValueHidden && modes.preciseValueVisible,
  nativeProfileMenuStillWorks: profileMenu.opened && profileMenu.hasRemainingUsage,
};

console.log(JSON.stringify({ checks, initial, open, modes, profileMenu, screenshots: { closedScreenshot, openScreenshot } }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
socket.close();
