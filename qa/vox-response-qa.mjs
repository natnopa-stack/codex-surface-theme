import fs from "node:fs/promises";

const port = Number(process.argv[2]);
const outputPath = process.argv[3];
if (!Number.isInteger(port) || port <= 0 || !outputPath) {
  throw new Error("Usage: node qa/vox-response-qa.mjs <debug-port> <output.png>");
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
    surface: root.getAttribute('data-codex-surface-layout') === 'surface',
    indicator: root.getAttribute('data-codex-assistant-indicator') || 'rider',
    responseEnabled: root.getAttribute('data-codex-assistant-indicator-enabled') !== 'false',
    onlineEnabled: root.getAttribute('data-codex-online-core-enabled') !== 'false',
  };
})()`);

const prepared = await evaluate(`(async () => {
  const root = document.documentElement;
  const controller = globalThis.__codexSurfaceLayoutController;
  controller?.setSurfaceActive?.(true, false);
  controller?.setAssistantIndicator?.('vox', false);
  controller?.setAssistantIndicatorEnabled?.(true, false);
  controller?.setOnlineCoreEnabled?.(true, false);
  const selector = '[data-content-search-unit-key]:has([data-markdown-text-style="assistant-message"])';
  const node = [...document.querySelectorAll(selector)].at(-1);
  const markdown = node?.querySelector('[data-markdown-text-style="assistant-message"]');
  if (!node || !markdown) return null;
  markdown.setAttribute('data-markdown-animated', 'true');
  node.setAttribute('data-codex-qa-vox-target', 'true');
  node.scrollIntoView({ block: 'center', inline: 'nearest' });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const rect = node.getBoundingClientRect();
  const container = node.querySelector(
    ':scope > [data-codex-vox-canvas-container="true"][data-codex-vox-location="response"]',
  );
  const canvas = container?.querySelector('[data-codex-vox-canvas="true"]');
  if (!container || !canvas) return null;
  const containerRect = container.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const context = canvas.getContext('2d');
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data || [];
  let energizedPixels = 0;
  let visiblePixels = 0;
  let visibleLuma = 0;
  let energizedMinY = canvas.height;
  let energizedMaxY = -1;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha > 0) {
      visiblePixels += 1;
      visibleLuma += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    }
    if (pixels[index] > 40 || pixels[index + 1] > 60 || pixels[index + 2] > 80) {
      energizedPixels += 1;
      const row = Math.floor(index / 4 / canvas.width);
      energizedMinY = Math.min(energizedMinY, row);
      energizedMaxY = Math.max(energizedMaxY, row);
    }
  }
  const before = getComputedStyle(node, '::before');
  const after = getComputedStyle(node, '::after');
  const containerStyle = getComputedStyle(container);
  return {
    rect: rect.toJSON(),
    clip: {
      x: Math.max(0, rect.x - 12),
      y: Math.max(0, rect.y - 14),
      width: Math.min(innerWidth - Math.max(0, rect.x - 12), rect.width + 24),
      height: Math.min(innerHeight - Math.max(0, rect.y - 14), Math.min(220, rect.height + 36)),
    },
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    canvas: {
      containerRect: containerRect.toJSON(),
      canvasRect: canvasRect.toJSON(),
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      expectedBufferWidth: Math.round(canvasRect.width * devicePixelRatio),
      expectedBufferHeight: Math.round(canvasRect.height * devicePixelRatio),
      backgroundColor: containerStyle.backgroundColor,
      borderRadius: containerStyle.borderRadius,
      energizedPixels,
      visiblePixels,
      averageVisibleLuma: visiblePixels ? Number((visibleLuma / visiblePixels).toFixed(2)) : 0,
      energizedVerticalSpanCss: energizedMaxY >= energizedMinY
        ? Number(((energizedMaxY - energizedMinY + 1) / devicePixelRatio).toFixed(2))
        : 0,
      running: root.getAttribute('data-codex-vox-running'),
    },
    instances: {
      total: document.querySelectorAll('[data-codex-vox-canvas-container="true"]').length,
      online: document.querySelectorAll('[data-codex-vox-location="online"]').length,
      response: document.querySelectorAll('[data-codex-vox-location="response"]').length,
      pretoken: document.querySelectorAll('[data-codex-vox-location="pretoken"]').length,
    },
    before: {
      content: before.content,
      top: before.top,
      width: before.width,
      height: before.height,
      background: before.background,
      boxShadow: before.boxShadow,
      maskImage: before.maskImage,
    },
    after: { content: after.content, display: after.display },
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
})()`);

if (!prepared) throw new Error("Assistant response target not found");
const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: false,
  clip: { ...prepared.clip, scale: 1 },
});
await fs.writeFile(outputPath, Buffer.from(screenshot.data, "base64"));

await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const node = document.querySelector('[data-codex-qa-vox-target="true"]');
  node?.removeAttribute('data-codex-qa-vox-target');
  node?.querySelector('[data-markdown-text-style="assistant-message"]')
    ?.removeAttribute('data-markdown-animated');
  controller?.setAssistantIndicator?.(${JSON.stringify(original.indicator)}, false);
  controller?.setAssistantIndicatorEnabled?.(${JSON.stringify(original.responseEnabled)}, false);
  controller?.setOnlineCoreEnabled?.(${JSON.stringify(original.onlineEnabled)}, false);
  controller?.setOnlineCoreState?.('auto');
  controller?.setSurfaceActive?.(${JSON.stringify(original.surface)}, false);
  return true;
})()`);

console.log(JSON.stringify({ outputPath, evidence: prepared }, null, 2));
socket.close();
