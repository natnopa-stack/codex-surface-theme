import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2]);
const compact = process.argv.includes("--compact");
const sourcesOnly = process.argv.includes("--sources-only");
const bundleMarkers = process.argv.includes("--bundle-markers");
const captureIndex = process.argv.indexOf("--capture");
const capturePath = captureIndex >= 0 && process.argv[captureIndex + 1]
  ? path.resolve(process.argv[captureIndex + 1])
  : null;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node qa/usage-source-probe.mjs <debug-port> [--capture <png>]");
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
const parsedScripts = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.method === "Debugger.scriptParsed" && message.params) {
    parsedScripts.push(message.params);
  }
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

await send("Debugger.enable");

const clickCenter = async (rect) => {
  if (!rect) return false;
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1,
  });
  return true;
};

const profileRect = await evaluate(`(() => {
  const node = document.querySelector(
    'button[aria-label="\u6253\u5f00\u4e2a\u4eba\u8d44\u6599\u83dc\u5355"], button[aria-label="Open profile menu"]',
  );
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()`);
await clickCenter(profileRect);
await new Promise((resolve) => setTimeout(resolve, 180));

const usageRect = await evaluate(`(() => {
  const node = [...document.querySelectorAll('[role="menuitem"], [role="menu"] button')]
    .find((candidate) => /^(?:\u5269\u4f59\u7528\u91cf|Remaining usage)$/i
      .test((candidate.textContent || "").replace(/\\s+/g, " ").trim()));
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
})()`);
await clickCenter(usageRect);
await new Promise((resolve) => setTimeout(resolve, 500));

const snapshot = await evaluate(`(async () => {
  const visible = (node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const describe = (node) => {
    const rect = node.getBoundingClientRect();
    return {
      tag: node.tagName,
      text: (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 2000),
      role: node.getAttribute("role"),
      aria: node.getAttribute("aria-label"),
      className: typeof node.className === "string" ? node.className.slice(0, 320) : "",
      attributes: Object.fromEntries([...node.attributes]
        .filter((attribute) => /^(?:aria-|data-|role|title|href)/.test(attribute.name))
        .map((attribute) => [attribute.name, attribute.value])),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  };
  const surfaces = [...document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], [data-radix-popper-content-wrapper]')]
    .filter(visible)
    .map(describe);
  const matchingNodes = [...document.querySelectorAll('body *')]
    .filter((node) => visible(node) && /(?:\u5269\u4f59|\u91cd\u7f6e|\u5c0f\u65f6|\u5468|remaining|reset|weekly|usage|5\\s*h)/i
      .test([node.textContent, node.getAttribute("aria-label"), node.getAttribute("title")].filter(Boolean).join(" ")))
    .filter((node) => ![...node.children].some((child) => visible(child) && /(?:\u5269\u4f59|\u91cd\u7f6e|\u5c0f\u65f6|\u5468|remaining|reset|weekly|usage|5\\s*h)/i
      .test([child.textContent, child.getAttribute("aria-label"), child.getAttribute("title")].filter(Boolean).join(" "))))
    .slice(0, 80)
    .map(describe);

  const usageValueNode = [...document.querySelectorAll('span, div')]
    .find((node) => visible(node) && /^(?:1\\s*\u5468|1\\s*week)$/i
      .test((node.textContent || "").replace(/\\s+/g, " ").trim()));
  const usageAncestors = [];
  for (let node = usageValueNode, depth = 0; node && depth < 6; node = node.parentElement, depth += 1) {
    usageAncestors.push({
      ...describe(node),
      html: node.outerHTML.slice(0, 5000),
    });
  }

  const wantedKey = /(?:rate.?limit|usage.?limit|remaining|reset|weekly|window|allowance|quota|credits?)/i;
  const blockedKey = /(?:access.?token|refresh.?token|authorization|cookie|secret|password)/i;
  const primitive = (value) =>
    value === null || ["string", "number", "boolean", "undefined"].includes(typeof value);
  const scanObject = (value, prefix, depth, seen, output) => {
    if (!value || typeof value !== "object" || depth > 3 || seen.has(value)) return;
    if (value instanceof Element || value instanceof Node || value instanceof Window) return;
    seen.add(value);
    for (const key of Object.keys(value).slice(0, 80)) {
      if (blockedKey.test(key)) continue;
      let child;
      try { child = value[key]; } catch { continue; }
      const nextPath = prefix ? prefix + "." + key : key;
      if (wantedKey.test(key)) {
        if (primitive(child)) output.push({ path: nextPath, value: String(child).slice(0, 300) });
        else if (Array.isArray(child)) output.push({ path: nextPath, value: "Array(" + child.length + ")" });
        else output.push({ path: nextPath, value: "Object{" + Object.keys(child || {}).slice(0, 20).join(",") + "}" });
      }
      if (!primitive(child) && typeof child !== "function") {
        scanObject(child, nextPath, depth + 1, seen, output);
      }
    }
  };

  const anchor = usageValueNode || document.querySelector('.app-shell-left-panel') || document.getElementById('root');
  const fiberKey = anchor && Object.keys(anchor).find(
    (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'),
  );
  const fiberMatches = [];
  const componentSources = [];
  let rateLimitDetails = null;
  let fiber = fiberKey ? anchor[fiberKey] : null;
  for (let depth = 0; fiber && depth < 30; fiber = fiber.return, depth += 1) {
    if (!rateLimitDetails && fiber.memoizedProps?.rateLimit) {
      const source = fiber.memoizedProps.rateLimit;
      const safeObject = (value) => value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value)
          .filter(([key, child]) => !blockedKey.test(key) && primitive(child))
          .map(([key, child]) => [key, child]))
        : null;
      rateLimitDetails = {
        ...safeObject(source),
        primary: safeObject(source.primary),
        secondary: safeObject(source.secondary),
        credits: safeObject(source.credits),
      };
    }
    if (
      fiber.memoizedProps?.rateLimit ||
      Array.isArray(fiber.memoizedProps?.rateLimits) ||
      (depth >= 14 && depth <= 24)
    ) {
      const componentFunction = typeof fiber.type === "function"
        ? fiber.type
        : typeof fiber.type?.type === "function"
          ? fiber.type.type
          : typeof fiber.elementType === "function"
            ? fiber.elementType
            : typeof fiber.elementType?.type === "function"
              ? fiber.elementType.type
              : typeof fiber.type?.render === "function"
                ? fiber.type.render
                : typeof fiber.elementType?.render === "function"
                  ? fiber.elementType.render
                  : null;
      componentSources.push({
        depth,
        type: typeof fiber.type === "string" ? fiber.type : componentFunction?.name || fiber.type?.name || fiber.elementType?.name || "anonymous",
        source: componentFunction ? String(componentFunction).slice(0, 12000) : "",
      });
    }
    const matches = [];
    scanObject(fiber.memoizedProps, "memoizedProps", 0, new WeakSet(), matches);
    scanObject(fiber.memoizedState, "memoizedState", 0, new WeakSet(), matches);
    if (matches.length) {
      fiberMatches.push({
        depth,
        type: typeof fiber.type === "string" ? fiber.type : fiber.type?.name || fiber.elementType?.name || "anonymous",
        matches: matches.slice(0, 80),
      });
    }
  }

  const resourceMatches = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => /(?:usage|limit|quota|credit|account|profile)/i.test(name))
    .slice(-100);
  const scriptUrls = [...document.scripts].map((script) => script.src).filter(Boolean);
  const bundleSnippets = [];
  if (${JSON.stringify(bundleMarkers)} && scriptUrls[0]) {
    const source = await fetch(scriptUrls[0]).then((response) => response.text());
    const markers = [
      'composer.mode.rateLimit.heading',
      'usageItems:',
      'availableRateLimitResetCount',
      'rateLimits:',
    ];
    for (const marker of markers) {
      let from = 0;
      for (let occurrence = 0; occurrence < 12; occurrence += 1) {
        const index = source.indexOf(marker, from);
        if (index < 0) break;
        bundleSnippets.push({
          marker,
          index,
          text: source.slice(Math.max(0, index - 2500), Math.min(source.length, index + 4500)),
        });
        from = index + marker.length;
      }
    }
  }
  return {
    profileTriggerFound: ${JSON.stringify(Boolean(profileRect))},
    usageMenuFound: ${JSON.stringify(Boolean(usageRect))},
    surfaces,
    matchingNodes,
    usageAncestors,
    fiberMatches,
    componentSources,
    rateLimitDetails,
    resourceMatches,
    scriptUrls,
    bundleSnippets,
  };
})()`);

if (bundleMarkers) {
  let source = "";
  const rendererScript = parsedScripts.find((script) => /\/assets\/index-[^/]+\.js$/.test(script.url || ""));
  if (rendererScript) {
    source = (await send("Debugger.getScriptSource", { scriptId: rendererScript.scriptId })).scriptSource || "";
  }
  if (!source && snapshot.scriptUrls[0]) {
    const tree = await send("Page.getResourceTree");
    source = (await send("Page.getResourceContent", {
      frameId: tree.frameTree.frame.id,
      url: snapshot.scriptUrls[0],
    })).content || "";
  }
  if (source) {
    const markers = [
      "composer.mode.rateLimit.heading",
      "usageItems:",
      "availableRateLimitResetCount",
      "rateLimits:",
    ];
    snapshot.bundleSnippets = [];
    for (const marker of markers) {
      let from = 0;
      for (let occurrence = 0; occurrence < 12; occurrence += 1) {
        const index = source.indexOf(marker, from);
        if (index < 0) break;
        snapshot.bundleSnippets.push({
          marker,
          index,
          text: source.slice(Math.max(0, index - 2500), Math.min(source.length, index + 4500)),
        });
        from = index + marker.length;
      }
    }
  }
}

if (capturePath) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.mkdirSync(path.dirname(capturePath), { recursive: true });
  fs.writeFileSync(capturePath, Buffer.from(screenshot.data, "base64"));
}

if (compact) delete snapshot.matchingNodes;
const output = sourcesOnly
  ? {
      rateLimitDetails: snapshot.rateLimitDetails,
      componentSources: snapshot.componentSources,
      scriptUrls: snapshot.scriptUrls,
      bundleSnippets: snapshot.bundleSnippets,
    }
  : { ...snapshot, screenshot: capturePath };
console.log(JSON.stringify(output, null, 2));
await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
socket.close();
