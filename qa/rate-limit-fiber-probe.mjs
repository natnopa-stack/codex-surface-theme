const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node qa/rate-limit-fiber-probe.mjs <debug-port>");
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

await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
await new Promise((resolve) => setTimeout(resolve, 180));

const result = await evaluate(`(() => {
  const rootNode = document.querySelector(".app-shell-left-panel") ||
    document.querySelector("[data-content-search-unit-key]") ||
    document.getElementById("root") || document.body;
  const containerKey = Object.keys(rootNode).find((key) => key.startsWith("__reactContainer$"));
  const fiberKey = Object.keys(rootNode).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
  let rootFiber = containerKey ? rootNode[containerKey]?.current : fiberKey ? rootNode[fiberKey] : null;
  while (rootFiber?.return) rootFiber = rootFiber.return;

  const isBucket = (value) => value && typeof value === "object" &&
    Number.isFinite(Number(value.usedPercent)) &&
    Number.isFinite(Number(value.windowDurationMins)) &&
    Number.isFinite(Number(value.resetsAt));
  const safeBucket = (value) => isBucket(value) ? {
    usedPercent: Number(value.usedPercent),
    windowDurationMins: Number(value.windowDurationMins),
    resetsAt: Number(value.resetsAt),
  } : null;
  const safeLimit = (value) => {
    if (!value || typeof value !== "object") return null;
    const primary = safeBucket(value.primary);
    const secondary = safeBucket(value.secondary);
    if (!primary && !secondary) return null;
    return { primary, secondary };
  };
  const matches = [];
  const storeMatches = [];
  const storeCandidates = [];
  const queryCandidates = [];
  let rateLimitRaw = null;
  const seenObjects = new WeakSet();
  const inspect = (value, path, component, source, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5 || seenObjects.has(value)) return;
    if (value instanceof Node || value instanceof Window) return;
    seenObjects.add(value);
    const direct = safeLimit(value);
    if (direct) matches.push({ component, source, path, limit: direct });
    if (isBucket(value)) matches.push({ component, source, path, bucket: safeBucket(value) });
    if (typeof value.getState === "function" && typeof value.subscribe === "function") {
      storeCandidates.push({ component, source, path, kind: "getState-subscribe" });
      try {
        const state = value.getState();
        const before = matches.length;
        inspect(state, path + ".getState()", component, source + ":store", depth + 1);
        if (matches.length > before) storeMatches.push({ component, source, path, kind: "getState-subscribe" });
      } catch {}
    }
    if (typeof value.getQueryCache === "function") {
      storeCandidates.push({ component, source, path, kind: "query-client" });
      try {
        const queries = value.getQueryCache().getAll();
        for (let index = 0; index < queries.length; index += 1) {
          const query = queries[index];
          const data = query?.state?.data;
          queryCandidates.push({
            index,
            queryHash: String(query?.queryHash || "").slice(0, 240),
            queryKey: (() => { try { return JSON.stringify(query?.queryKey).slice(0, 600); } catch { return ""; } })(),
            dataKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 40) : [],
            dataUpdatedAt: Number(query?.state?.dataUpdatedAt || 0),
          });
          if (query?.queryHash === '["rate-limit-status"]' && data && typeof data === "object") {
            const safeBranch = (branch) => branch && typeof branch === "object" ? {
              used_percent: branch.used_percent ?? null,
              limit_window_seconds: branch.limit_window_seconds ?? null,
              reset_at: branch.reset_at ?? null,
              usedPercent: branch.usedPercent ?? null,
              windowDurationMins: branch.windowDurationMins ?? null,
              resetsAt: branch.resetsAt ?? null,
            } : null;
            const safeLimitStatus = (status) => status && typeof status === "object" ? {
              ...safeBranch(status),
              primary_window: safeBranch(status.primary_window),
              secondary_window: safeBranch(status.secondary_window),
              primary: safeBranch(status.primary),
              secondary: safeBranch(status.secondary),
            } : null;
            rateLimitRaw = {
              plan_type: data.plan_type ?? null,
              rate_limit: safeLimitStatus(data.rate_limit),
              additional_rate_limits: Array.isArray(data.additional_rate_limits)
                ? data.additional_rate_limits.slice(0, 8).map((entry) => ({
                    limit_name: entry?.limit_name ?? null,
                    rate_limit: safeLimitStatus(entry?.rate_limit ?? entry),
                  }))
                : [],
              credits: data.credits && typeof data.credits === "object" ? {
                has_credits: data.credits.has_credits ?? null,
                unlimited: data.credits.unlimited ?? null,
                balance: data.credits.balance ?? null,
              } : null,
            };
          }
          const querySeen = new WeakSet();
          const scanQuery = (candidate, queryPath, queryDepth = 0) => {
            if (!candidate || typeof candidate !== "object" || queryDepth > 12 || querySeen.has(candidate)) return;
            querySeen.add(candidate);
            const directLimit = safeLimit(candidate);
            if (directLimit) matches.push({ component, source: source + ":query", path: queryPath, limit: directLimit });
            if (isBucket(candidate)) matches.push({ component, source: source + ":query", path: queryPath, bucket: safeBucket(candidate) });
            let children = [];
            try { children = Array.isArray(candidate) ? Array.from(candidate).slice(0, 60).map((child, childIndex) => [String(childIndex), child]) : Object.entries(candidate).slice(0, 160); }
            catch { return; }
            for (const childEntry of children) {
              if (!Array.isArray(childEntry) || childEntry.length < 2) continue;
              const [childKey, child] = childEntry;
              if (/token|secret|password|authorization|cookie/i.test(childKey)) continue;
              if (child && typeof child === "object") scanQuery(child, queryPath + "." + childKey, queryDepth + 1);
            }
          };
          scanQuery(data, path + ".queries[" + index + "].data");
        }
      } catch {}
    }
    let entries = [];
    try {
      entries = Array.isArray(value)
        ? Array.from(value).slice(0, 24).map((child, index) => [String(index), child])
        : Array.from(Object.entries(value)).slice(0, 80);
    } catch { return; }
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const key = entry[0];
      const child = entry[1];
      if (/token|secret|password|authorization|cookie/i.test(key)) continue;
      if (!child || typeof child !== "object") continue;
      inspect(child, path + "." + key, component, source, depth + 1);
    }
  };

  const stack = rootFiber ? [rootFiber] : [];
  let visited = 0;
  while (stack.length && visited < 25000) {
    const fiber = stack.pop();
    visited += 1;
    const component = typeof fiber.type === "string"
      ? fiber.type
      : fiber.type?.name || fiber.elementType?.name || "anonymous";
    inspect(fiber.memoizedProps, "memoizedProps", component, "fiber-props");
    inspect(fiber.memoizedState, "memoizedState", component, "fiber-state");
    let hook = fiber.memoizedState;
    for (let index = 0; hook && index < 80; index += 1, hook = hook.next) {
      inspect(hook.memoizedState, "hook[" + index + "].memoizedState", component, "hook");
      inspect(hook.baseState, "hook[" + index + "].baseState", component, "hook-base");
    }
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  const profile = document.querySelector(
    'button[aria-label="\u6253\u5f00\u4e2a\u4eba\u8d44\u6599\u83dc\u5355"], button[aria-label="Open profile menu"]',
  );
  const profileAncestors = [];
  for (let node = profile, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
    const rect = node.getBoundingClientRect();
    profileAncestors.push({
      depth,
      tag: node.tagName,
      className: typeof node.className === "string" ? node.className.slice(0, 500) : "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      html: node.outerHTML.slice(0, 6000),
    });
  }
  return {
    visited,
    matches: matches.slice(0, 100),
    storeMatches: storeMatches.slice(0, 40),
    storeCandidates: storeCandidates.slice(0, 100),
    queryCandidates: queryCandidates.slice(0, 300),
    rateLimitRaw,
    profileAncestors,
  };
})()`);

console.log(JSON.stringify(result, null, 2));
socket.close();
