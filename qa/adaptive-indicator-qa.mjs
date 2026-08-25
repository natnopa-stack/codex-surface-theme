import fs from "node:fs/promises";

const port = Number(process.argv[2]);
const theme = process.argv[3];
const indicator = process.argv[4];
const state = process.argv[5] || "active";
const outputPath = process.argv[6];
const progress = Math.max(0, Math.min(1, Number(process.argv[7] || 0.46)));

if (!Number.isInteger(port) || !["light", "dark"].includes(theme) ||
    !["rider", "current", "ecg", "vox"].includes(indicator) || !outputPath) {
  throw new Error(
    "Usage: node qa/adaptive-indicator-qa.mjs <port> <light|dark> " +
    "<rider|current|ecg|vox> <idle|active> <output.png> [progress]",
  );
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(
  (candidate) => candidate.type === "page" && candidate.url === "app://-/index.html",
);
if (!target) throw new Error("Codex renderer not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP connection timed out")), 5000);
  socket.addEventListener("open", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
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
    throw new Error(response.exceptionDetails.exception?.description || "Evaluation failed");
  }
  return response.result.value;
};

const original = await evaluate(`(() => {
  const root = document.documentElement;
  return {
    className: root.className,
    surface: root.getAttribute('data-codex-surface-layout') === 'surface',
    indicator: root.getAttribute('data-codex-assistant-indicator') || 'rider',
    responseEnabled: root.getAttribute('data-codex-assistant-indicator-enabled') !== 'false',
    onlineEnabled: root.getAttribute('data-codex-online-core-enabled') !== 'false',
    state: root.getAttribute('data-codex-online-core-state') || 'auto',
  };
})()`);

try {
  await evaluate(`(() => {
    const root = document.documentElement;
    const controller = globalThis.__codexSurfaceLayoutController;
    root.classList.remove('light', 'dark', 'electron-light', 'electron-dark');
    root.classList.add(${JSON.stringify(theme === "light" ? "electron-light" : "electron-dark")});
    if (${JSON.stringify(theme)} === 'dark') root.classList.add('dark');
    controller?.setSurfaceActive?.(true, false);
    controller?.setAssistantIndicator?.(${JSON.stringify(indicator)}, false);
    controller?.setAssistantIndicatorEnabled?.(true, false);
    controller?.setOnlineCoreEnabled?.(true, false);
    controller?.setOnlineCoreState?.(${JSON.stringify(state)});
    return true;
  })()`);
  // Let the 180 ms mode/energy transitions settle before freezing a visual
  // animation frame. Freezing CSS transitions would capture blended colors or
  // dimensions from the previously selected indicator rather than the target.
  await new Promise((resolve) => setTimeout(resolve, 260));

  const evidence = await evaluate(`(() => {
    const root = document.documentElement;
    const sidebar = document.querySelector('.app-shell-left-panel');
    const core = sidebar?.querySelector('[data-codex-online-core="true"]');
    const rail = core?.querySelector('[data-codex-online-core-rail="true"]');
    const mark = core?.querySelector('[data-codex-online-core-mark="true"]');
    const responseCandidates = [...document.querySelectorAll(
      '[data-content-search-unit-key]:has([data-markdown-text-style="assistant-message"])',
    )];
    const response = responseCandidates.findLast((node) => {
      const style = getComputedStyle(node, '::before');
      return style.content !== 'none' && style.animationName !== 'none';
    }) || responseCandidates.at(-1) || null;
    const animations = (core?.getAnimations({ subtree: true }) || []).filter(
      (animation) => animation.constructor?.name === 'CSSAnimation',
    );
    for (const animation of animations) {
      const duration = Number(animation.effect?.getTiming?.().duration) || 0;
      animation.pause();
      animation.currentTime = duration * ${JSON.stringify(progress)};
    }
    const railStyle = rail ? getComputedStyle(rail) : null;
    const markStyle = mark ? getComputedStyle(mark) : null;
    const responseRailStyle = response ? getComputedStyle(response, '::before') : null;
    const responseBeatStyle = response ? getComputedStyle(response, '::after') : null;
    const coreRect = core?.getBoundingClientRect() || null;
    const overlaps = coreRect ? [...sidebar.querySelectorAll('button')].filter((button) => {
      if (core.contains(button)) return false;
      const rect = button.getBoundingClientRect();
      return !(coreRect.right <= rect.left || coreRect.left >= rect.right ||
        coreRect.bottom <= rect.top || coreRect.top >= rect.bottom);
    }).length : 0;
    return {
      rootClass: root.className,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      indicator: root.getAttribute('data-codex-assistant-indicator'),
      state: root.getAttribute('data-codex-online-core-state'),
      coreRect: coreRect?.toJSON?.() || null,
      rail: railStyle ? {
        height: railStyle.height,
        animationName: railStyle.animationName,
        animationDuration: railStyle.animationDuration,
        animationDirection: railStyle.animationDirection,
        backgroundImage: railStyle.backgroundImage.slice(0, 300),
        filter: railStyle.filter,
      } : null,
      mark: markStyle ? {
        width: markStyle.width,
        height: markStyle.height,
        left: markStyle.left,
        opacity: markStyle.opacity,
        transform: markStyle.transform,
        animationName: markStyle.animationName,
        animationDuration: markStyle.animationDuration,
        animationDirection: markStyle.animationDirection,
        filter: markStyle.filter,
      } : null,
      responseRail: responseRailStyle ? {
        height: responseRailStyle.height,
        animationName: responseRailStyle.animationName,
        animationDuration: responseRailStyle.animationDuration,
        animationDirection: responseRailStyle.animationDirection,
        filter: responseRailStyle.filter,
      } : null,
      responseBeat: responseBeatStyle ? {
        width: responseBeatStyle.width,
        height: responseBeatStyle.height,
        animationName: responseBeatStyle.animationName,
        animationDuration: responseBeatStyle.animationDuration,
        animationDirection: responseBeatStyle.animationDirection,
        filter: responseBeatStyle.filter,
      } : null,
      overlaps,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  })()`);

  const clip = await evaluate(`(() => {
    const sidebar = document.querySelector('.app-shell-left-panel');
    if (!sidebar) return null;
    const rect = sidebar.getBoundingClientRect();
    return {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.min(rect.width, innerWidth - Math.max(0, rect.x)),
      height: Math.min(212, rect.height, innerHeight - Math.max(0, rect.y)),
    };
  })()`);
  if (!clip) throw new Error("Sidebar not found");
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale: 1 },
  });
  await fs.writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ outputPath, clip, evidence }, null, 2));
} finally {
  await evaluate(`(() => {
    const root = document.documentElement;
    const controller = globalThis.__codexSurfaceLayoutController;
    root.className = ${JSON.stringify(original.className)};
    controller?.setAssistantIndicator?.(${JSON.stringify(original.indicator)}, false);
    controller?.setAssistantIndicatorEnabled?.(${JSON.stringify(original.responseEnabled)}, false);
    controller?.setOnlineCoreEnabled?.(${JSON.stringify(original.onlineEnabled)}, false);
    // QA may force active/idle for a deterministic frame, but the production
    // controller is activity-driven. Restoring the observed attribute value
    // would pin the private forced-state latch and leave real thinking turns
    // rendering with idle energy after the test exits.
    controller?.setOnlineCoreState?.('auto');
    controller?.setSurfaceActive?.(${JSON.stringify(original.surface)}, false);
    return true;
  })()`);
  socket.close();
}
