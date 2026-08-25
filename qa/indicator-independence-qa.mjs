const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node qa/indicator-independence-qa.mjs <debug-port>");
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
    throw new Error(response.exceptionDetails.exception?.description || "Runtime evaluation failed");
  }
  return response.result.value;
};

const result = await evaluate(`(async () => {
  const root = document.documentElement;
  const controller = globalThis.__codexSurfaceLayoutController;
  if (!controller?.setAssistantIndicatorEnabled || !controller?.setOnlineCoreEnabled) {
    return { passed: false, reason: "independent controller API is unavailable" };
  }

  const original = {
    surface: root.getAttribute("data-codex-surface-layout") === "surface",
    response: root.getAttribute("data-codex-assistant-indicator-enabled") !== "false",
    onlineCore: root.getAttribute("data-codex-online-core-enabled") !== "false",
  };
  controller.setSurfaceActive(true, false);

  const cases = [];
  for (const [responseEnabled, onlineCoreEnabled] of [
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ]) {
    // Persist during the matrix just like a real settings click. The settings
    // panel continuously reconciles controls from localStorage and would
    // intentionally overwrite non-persisted test-only values.
    controller.setAssistantIndicatorEnabled(responseEnabled, true);
    controller.setOnlineCoreEnabled(onlineCoreEnabled, true);
    // Electron throttles requestAnimationFrame while the window is not the
    // foreground surface. A short timer keeps this QA deterministic in CI and
    // when Codex is covered by the terminal.
    await new Promise((resolve) => setTimeout(resolve, 40));

    const core = document.querySelector('[data-codex-online-core="true"]');
    const coreDisplay = core ? getComputedStyle(core).display : null;
    const responseAttr = root.getAttribute("data-codex-assistant-indicator-enabled");
    const onlineCoreAttr = root.getAttribute("data-codex-online-core-enabled");
    const responseSwitch = document.querySelector('[data-codex-assistant-enabled-switch="true"]');
    const onlineCoreSwitch = document.querySelector('[data-codex-online-core-switch="true"]');
    const styleButtons = [...document.querySelectorAll('[data-codex-assistant-indicator-value]')];
    const responseSwitchChecked = responseSwitch?.getAttribute("aria-checked") ?? null;
    const onlineCoreSwitchChecked = onlineCoreSwitch?.getAttribute("aria-checked") ?? null;
    const expectedCoreDisplay = onlineCoreEnabled ? "flex" : "none";
    const coreDisplayMatches = coreDisplay === null || coreDisplay === expectedCoreDisplay;
    cases.push({
      responseEnabled,
      onlineCoreEnabled,
      responseAttr,
      onlineCoreAttr,
      coreDisplay,
      responseSwitchChecked,
      onlineCoreSwitchChecked,
      styleButtonsDisabled: styleButtons.map((button) => button.disabled),
      passed:
        responseAttr === String(responseEnabled) &&
        onlineCoreAttr === String(onlineCoreEnabled) &&
        coreDisplayMatches &&
        (responseSwitchChecked === null || responseSwitchChecked === String(responseEnabled)) &&
        (onlineCoreSwitchChecked === null || onlineCoreSwitchChecked === String(onlineCoreEnabled)) &&
        styleButtons.every((button) => !button.disabled),
    });
  }

  controller.setAssistantIndicatorEnabled(original.response, true);
  controller.setOnlineCoreEnabled(original.onlineCore, true);
  controller.setSurfaceActive(original.surface, false);
  return { passed: cases.every((item) => item.passed), original, cases };
})()`);

console.log(JSON.stringify(result, null, 2));
socket.close();
if (!result?.passed) process.exitCode = 1;
