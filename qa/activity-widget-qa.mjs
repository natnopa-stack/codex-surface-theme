import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2]);
const captureAppearance = process.argv.includes("--capture-appearance");
const probeAppearance = process.argv.includes("--probe-appearance") || captureAppearance;
const probeSettings = process.argv.includes("--probe-settings") || probeAppearance;
const probeOnly = process.argv.includes("--probe") || probeSettings;
const sampleState = process.argv.includes("--sample");
const captureIndex = process.argv.indexOf("--capture");
const capturePath = captureIndex >= 0 && process.argv[captureIndex + 1]
  ? path.resolve(process.argv[captureIndex + 1])
  : null;
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("Usage: node qa/activity-widget-qa.mjs <debug-port> [--probe]");
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

if (probeOnly) {
  if (probeSettings) {
    const triggerRect = await evaluate(`(() => {
      const trigger = document.querySelector(
        'button[aria-label="\u6253\u5f00\u4e2a\u4eba\u8d44\u6599\u83dc\u5355"], button[aria-label="Open profile menu"]',
      );
      if (!trigger) return null;
      const rect = trigger.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (triggerRect) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: triggerRect.x, y: triggerRect.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: triggerRect.x, y: triggerRect.y, button: "left", clickCount: 1 });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    const menu = await evaluate(`(() => ({
      opened: ${JSON.stringify(Boolean(triggerRect))},
      candidates: [...document.querySelectorAll('[role="menuitem"], [role="menu"] button, [data-radix-menu-content] button')]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((node) => ({
          text: (node.textContent || "").replace(/\\s+/g, " ").trim(),
          role: node.getAttribute("role"),
          aria: node.getAttribute("aria-label"),
          testid: node.getAttribute("data-testid"),
        })),
      surfaces: [...document.querySelectorAll('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((node) => ({
          text: (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 600),
          role: node.getAttribute("role"),
          rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        })),
    }))()`);
    if (probeAppearance) {
      const settingsRect = await evaluate(`(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find(
          (node) => /^(?:\u8bbe\u7f6e|Settings)(?:Ctrl\\+,)?$/i.test((node.textContent || "").replace(/\\s+/g, "").trim()),
        );
        if (!item) return null;
        const rect = item.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`);
      if (settingsRect) {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: settingsRect.x, y: settingsRect.y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: settingsRect.x, y: settingsRect.y, button: "left", clickCount: 1 });
      }
      await new Promise((resolve) => setTimeout(resolve, 240));
      const appearance = await evaluate(`(() => ({
        settingsClicked: ${JSON.stringify(Boolean(settingsRect))},
        candidates: [...document.querySelectorAll('button, [role="tab"], [role="menuitem"], a')]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && /(?:\u5916\u89c2|Appearance)/i.test(node.textContent || node.getAttribute("aria-label") || "");
          })
          .map((node) => ({
            text: (node.textContent || "").replace(/\\s+/g, " ").trim(),
            role: node.getAttribute("role"),
            aria: node.getAttribute("aria-label"),
            slug: node.getAttribute("data-settings-panel-slug"),
            rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
          })),
        dialogs: [...document.querySelectorAll('[role="dialog"]')]
          .filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map((node) => (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 1000)),
      }))()`);
      let control = null;
      if (captureAppearance && appearance.candidates[0]?.rect) {
        const rect = appearance.candidates[0].rect;
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
        await new Promise((resolve) => setTimeout(resolve, 260));
        await evaluate(`globalThis.__codexSurfaceLayoutController?.mount?.(); true`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        control = await evaluate(`(() => {
          const node = document.querySelector('[data-codex-live-activity-control="true"]');
          node?.scrollIntoView({ block: "center", behavior: "instant" });
          if (!node) return null;
          const root = document.documentElement;
          const originalAccent = root.getAttribute('data-codex-live-activity-accent') || 'violet';
          const originalEnabled = root.getAttribute('data-codex-live-activity-enabled') !== 'false';
          const independentBefore = [
            root.getAttribute('data-codex-assistant-indicator-enabled'),
            root.getAttribute('data-codex-online-core-enabled'),
            root.getAttribute('data-codex-context-accent'),
          ].join('|');
          const testAccent = originalAccent === 'green' ? 'violet' : 'green';
          node.querySelector('[data-codex-live-activity-accent-value="' + testAccent + '"]')?.click();
          const accentClickWorks = root.getAttribute('data-codex-live-activity-accent') === testAccent;
          node.querySelector('[data-codex-live-activity-accent-value="' + originalAccent + '"]')?.click();
          const switchButton = node.querySelector('[data-codex-live-activity-switch="true"]');
          switchButton?.click();
          const switchClickWorks = (root.getAttribute('data-codex-live-activity-enabled') !== 'false') !== originalEnabled;
          switchButton?.click();
          const independentAfter = [
            root.getAttribute('data-codex-assistant-indicator-enabled'),
            root.getAttribute('data-codex-online-core-enabled'),
            root.getAttribute('data-codex-context-accent'),
          ].join('|');
          const rect = node.getBoundingClientRect();
          return {
            text: (node.textContent || "").replace(/\\s+/g, " ").trim(),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            swatches: node.querySelectorAll('[data-codex-live-activity-accent-value]').length,
            selectedAccent: node.querySelector('[data-codex-live-activity-accent-value][data-active]')?.getAttribute('data-codex-live-activity-accent-value') || null,
            enabled: switchButton?.getAttribute('aria-checked') === 'true',
            accentClickWorks,
            switchClickWorks,
            preferencesIndependent: independentBefore === independentAfter,
            withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          };
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (capturePath) {
          const screenshot = await send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
            fromSurface: true,
          });
          fs.mkdirSync(path.dirname(capturePath), { recursive: true });
          fs.writeFileSync(capturePath, Buffer.from(screenshot.data, "base64"));
        }
      } else {
        await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
      }
      console.log(JSON.stringify({ menu, appearance, control, screenshot: capturePath }, null, 2));
      socket.close();
      process.exit(0);
    }
    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
    console.log(JSON.stringify(menu, null, 2));
    socket.close();
    process.exit(0);
  }
  const probe = await evaluate(`(() => {
    const rect = (node) => {
      if (!(node instanceof Element)) return null;
      const value = node.getBoundingClientRect();
      return {
        x: Math.round(value.x), y: Math.round(value.y),
        width: Math.round(value.width), height: Math.round(value.height),
      };
    };
    const summarize = (node) => node instanceof Element ? {
      tag: node.tagName,
      text: (node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 180),
      className: typeof node.className === "string" ? node.className.slice(0, 240) : "",
      attributes: Object.fromEntries([...node.attributes]
        .filter((attribute) => /^(aria-|data-|role|title)/.test(attribute.name))
        .map((attribute) => [attribute.name, attribute.value])),
      rect: rect(node),
    } : null;
    const activeConversationId = (() => {
      const row = document.querySelector(
        '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-active="true"], ' +
        '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]',
      );
      const rawId = row?.getAttribute("data-app-action-sidebar-thread-id") || "";
      const hostId = row?.getAttribute("data-app-action-sidebar-thread-host-id") || "";
      const prefix = hostId ? hostId + ":" : "";
      return prefix && rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId.replace(/^[^:]+:/, "");
    })();
    const store = (() => {
      const anchor = document.querySelector("[data-content-search-unit-key]") ||
        document.querySelector(".app-shell-left-panel") || document.getElementById("root");
      const fiberKey = anchor && Object.keys(anchor).find(
        (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
      );
      const containerKey = anchor && Object.keys(anchor).find((key) => key.startsWith("__reactContainer$"));
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
          for (const candidate of [state, state?.value, state?.store, state?.threadStore]) {
            if (candidate?.conversations instanceof Map) return candidate;
          }
        }
        if (current.child) stack.push(current.child);
        if (current.sibling) stack.push(current.sibling);
      }
      return null;
    })();
    const conversation = activeConversationId && store?.conversations instanceof Map
      ? store.conversations.get(activeConversationId)
      : null;
    const runtimeConversations = store?.conversations instanceof Map
      ? [...store.conversations.values()]
        .filter((item) => item?.threadRuntimeStatus?.type === "active")
        .map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
          recencyAt: item.recencyAt,
          threadRuntimeStatus: item.threadRuntimeStatus,
          latestModel: item.latestModel,
          latestReasoningEffort: item.latestReasoningEffort,
          requests: item.requests,
        }))
      : [];
    const runtimeTimingProbe = store?.conversations instanceof Map
      ? [...store.conversations.values()]
        .filter((item) => item?.threadRuntimeStatus?.type === "active")
        .map((item) => {
          const status = item.threadRuntimeStatus || {};
          const flags = status.activeFlags;
          return {
            id: item.id,
            statusKeys: Object.keys(status),
            status: Object.fromEntries(Object.entries(status).filter(([key, value]) =>
              /(?:time|start|created|updated|duration|elapsed|run|active)/i.test(key) &&
              (typeof value !== "object" || value === null),
            )),
            activeFlagsType: flags?.constructor?.name || typeof flags,
            activeFlags: flags instanceof Map
              ? [...flags.entries()].slice(0, 8)
              : Array.isArray(flags)
                ? flags.slice(0, 8)
                : flags && typeof flags === "object"
                  ? Object.fromEntries(Object.entries(flags).slice(0, 12))
                  : flags ?? null,
          };
        })
      : [];
    const shallow = (value, depth = 0) => {
      if (value == null || typeof value !== "object") return value;
      if (depth >= 3) return Array.isArray(value) ? '[array]' : '[object]';
      if (Array.isArray(value)) return value.slice(-3).map((item) => shallow(item, depth + 1));
      return Object.fromEntries(Object.entries(value).slice(0, 24).map(
        ([key, item]) => [key, shallow(item, depth + 1)],
      ));
    };
    const sidebar = document.querySelector(".app-shell-left-panel");
    const recentText = [...(sidebar?.querySelectorAll("*") || [])].find(
      (node) => node.children.length === 0 && /^(最近|Recent)$/.test((node.textContent || "").trim()),
    );
    const composer = document.querySelector("[data-composer-surface-variant]");
    const composerControls = [...(composer?.querySelectorAll("button, [role=button]") || [])]
      .map(summarize).filter(Boolean);
    const settingsCandidates = [...document.querySelectorAll("button, [role=button], a")]
      .map(summarize)
      .filter((node) => /(?:\u8bbe\u7f6e|settings|\u5916\u89c2|appearance|preferences)/i.test(
        [node?.text, node?.attributes?.["aria-label"], node?.attributes?.title,
          node?.attributes?.["data-testid"]].filter(Boolean).join(" "),
      ));
    const sidebarFooterCandidates = [...(sidebar?.querySelectorAll("button, [role=button], a") || [])]
      .map(summarize)
      .filter(Boolean)
      .slice(-12);
    const reasoningButton = composer?.querySelector('[data-composer-navigation-target="reasoning"]');
    const childTree = (node, depth = 0) => {
      if (!(node instanceof Element) || depth > 3) return null;
      return {
        tag: node.tagName,
        text: node.children.length === 0 ? (node.textContent || "").trim().slice(0, 80) : "",
        className: typeof node.className === "string" ? node.className.slice(0, 180) : "",
        attributes: Object.fromEntries([...node.attributes]
          .filter((attribute) => /^(aria-|data-|role|title)/.test(attribute.name))
          .map((attribute) => [attribute.name, attribute.value])),
        rect: rect(node),
        children: [...node.children].map((child) => childTree(child, depth + 1)).filter(Boolean),
      };
    };
    const activityNodes = [...document.querySelectorAll(
      '[data-testid*="agent" i], [data-testid*="tool" i], [data-agent], [data-tool], [class*="agent" i], [class*="tool-call" i]',
    )].slice(0, 16).map(summarize);
    const runtimeCandidates = [...document.querySelectorAll("body *")]
      .filter((node) => node.children.length === 0 && /(?:耗时|elapsed|duration|runtime|运行时间)/i.test((node.textContent || "").trim()))
      .map((node) => ({
        ...summarize(node),
        parent: summarize(node.parentElement),
        grandparent: summarize(node.parentElement?.parentElement),
      })).filter(Boolean).slice(0, 24);
    const modelCandidates = [...document.querySelectorAll(
      '[data-composer-navigation-target="reasoning"] *, [data-composer-navigation-target="reasoning"], [data-selected-reasoning-effort]',
    )].map(summarize).filter(Boolean).slice(0, 32);
    return {
      href: location.href,
      sidebar: summarize(sidebar),
      recentText: summarize(recentText),
      recentAncestors: recentText ? [recentText, recentText.parentElement, recentText.parentElement?.parentElement,
        recentText.parentElement?.parentElement?.parentElement].map(summarize) : [],
      composer: summarize(composer),
      composerControls,
      settingsCandidates,
      sidebarFooterCandidates,
      reasoningButtonTree: childTree(reasoningButton),
      composerAncestorTree: childTree(reasoningButton?.parentElement),
      reasoningPseudo: reasoningButton ? {
        before: Object.fromEntries(["content", "display", "width", "height", "background", "border", "borderRadius"].map(
          (name) => [name, getComputedStyle(reasoningButton, "::before").getPropertyValue(name)],
        )),
        after: Object.fromEntries(["content", "display", "width", "height", "background", "border", "borderRadius"].map(
          (name) => [name, getComputedStyle(reasoningButton, "::after").getPropertyValue(name)],
        )),
        ancestors: [reasoningButton.parentElement, reasoningButton.parentElement?.parentElement,
          reasoningButton.parentElement?.parentElement?.parentElement,
          reasoningButton.parentElement?.parentElement?.parentElement?.parentElement].map(summarize),
        controlRowChildren: [...(reasoningButton.parentElement?.parentElement?.parentElement?.children || [])]
          .map((node) => ({ summary: summarize(node), tree: childTree(node, 0) })),
      } : null,
      activityNodes,
      runtimeCandidates,
      modelCandidates,
      activeConversationId,
      runtimeConversations: shallow(runtimeConversations),
      runtimeTimingProbe: shallow(runtimeTimingProbe),
      conversation: conversation ? {
        keys: Object.keys(conversation),
        threadRuntimeStatus: shallow(conversation.threadRuntimeStatus),
        latestTokenUsageInfo: shallow(conversation.latestTokenUsageInfo),
        turns: shallow(conversation.turns),
        requests: shallow(conversation.requests),
      } : null,
    };
  })()`);
  console.log(JSON.stringify(probe, null, 2));
  socket.close();
  process.exit(0);
}

const originalLiveActivityEnabled = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  if (!controller?.setLiveActivityEnabled) return null;
  const enabled = document.documentElement.getAttribute("data-codex-live-activity-enabled") !== "false";
  controller.setLiveActivityEnabled(true, false);
  controller.mount?.();
  controller.refreshLiveActivity?.();
  return enabled;
})()`);
const ready = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  if (!controller?.refreshLiveActivity) return false;
  controller.refreshLiveActivity();
  return true;
})()`);
if (!ready) throw new Error("live activity controller API is unavailable");
const idempotentRefreshBehavior = await evaluate(`(async () => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState({
    active: true,
    taskId: "idempotent-refresh",
    task: "Idempotent refresh QA",
    observedEvents: 1,
  });
  const widget = document.querySelector('[data-codex-live-activity="true"]');
  const header = widget?.querySelector('[data-codex-live-header="true"]');
  if (!widget || !header) return null;
  const observer = new MutationObserver(() => {});
  observer.observe(header, { childList: true, subtree: true });
  const startedAt = performance.now();
  controller.refreshLiveActivity();
  controller.refreshLiveActivity();
  await Promise.resolve();
  const records = observer.takeRecords();
  observer.disconnect();
  controller.setLiveActivityState("auto");
  return {
    elapsedMs: performance.now() - startedAt,
    childListMutations: records.filter((record) => record.type === "childList").length,
  };
})()`);
  const observableStageProgression = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const read = () => {
    const widget = document.querySelector('[data-codex-live-activity="true"]');
    return {
      label: widget?.querySelector('[data-codex-live-progress-label="true"]')?.textContent || null,
      value: widget?.querySelector('[data-codex-live-progress-value="true"]')?.textContent || null,
      state: widget?.getAttribute('data-live-state') || null,
      states: [...(widget?.querySelectorAll('[data-codex-live-progress-segment]') || [])]
        .map((segment) => segment.getAttribute('data-state')),
      source: document.documentElement.getAttribute('data-codex-live-activity-source'),
      stage: Number(document.documentElement.getAttribute('data-codex-live-stage')),
    };
  };
  const snapshots = [];
  for (let observedEvents = 0; observedEvents <= 3; observedEvents += 1) {
    controller.setLiveActivityState({
      active: true,
      task: "Observable progress QA",
      model: "SOL high+Terra mid",
      tool: observedEvents ? "shell_command" : "reasoning",
      agents: [],
      total: 0,
      done: 0,
      observedEvents,
    });
    snapshots.push(read());
  }
  controller.setLiveActivityState("auto");
  return snapshots;
})()`);
const completionBehavior = await evaluate(`(async () => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const read = () => {
    const widget = document.querySelector('[data-codex-live-activity="true"]');
    return {
      state: widget?.getAttribute('data-live-state') || null,
      title: widget?.querySelector('[data-codex-live-title="true"]')?.textContent || null,
      stateText: widget?.querySelector('[data-codex-live-state-text="true"]')?.textContent || null,
      condensed: widget?.hasAttribute('data-condensed') || false,
    };
  };
  controller.setLiveActivityState({ active: true, task: "Completion freeze QA", observedEvents: 0 });
  const activeWidget = document.querySelector('[data-codex-live-activity="true"]');
  const activeToggle = activeWidget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  if (activeWidget && activeToggle) {
    if (!activeWidget.hasAttribute("data-condensed")) activeToggle.click();
    if (activeWidget.hasAttribute("data-condensed")) activeToggle.click();
  }
  await new Promise((resolve) => setTimeout(resolve, 1100));
  controller.setLiveActivityState({ active: false, task: "Completion freeze QA", observedEvents: 0 });
  const completed = read();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const frozen = read();
  document.querySelector('[data-codex-live-activity="true"]')?.setAttribute("data-auto-condensed", "");
  document.querySelector('[data-codex-live-collapse-toggle="true"]')?.click();
  const expanded = read();
  controller.setLiveActivityState("auto");
  return { completed, frozen, expanded };
})()`);
const activeCollapseBehavior = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const read = () => document.querySelector('[data-codex-live-activity="true"]')?.hasAttribute("data-condensed") || false;
  controller.setLiveActivityState({ active: true, task: "Active collapse QA", observedEvents: 0 });
  const initial = read();
  document.querySelector('[data-codex-live-collapse-toggle="true"]')?.click();
  const collapsed = read();
  document.querySelector('[data-codex-live-collapse-toggle="true"]')?.click();
  const expanded = read();
  controller.setLiveActivityState("auto");
  return { initial, collapsed, expanded };
})()`);
const activePointerCollapseSetup = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState({ active: true, task: "Pointer collapse QA", observedEvents: 0 });
  const widget = document.querySelector('[data-codex-live-activity="true"]');
  const toggle = widget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  if (!widget || !toggle) return null;
  const rect = toggle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return {
    x,
    y,
    rect: { width: rect.width, height: rect.height },
    hitToggle: hit === toggle || Boolean(hit?.closest?.('[data-codex-live-collapse-toggle="true"]')),
    pointerEvents: getComputedStyle(toggle).pointerEvents,
    initial: widget.hasAttribute("data-condensed"),
  };
})()`);
let activePointerCollapseBehavior = null;
if (activePointerCollapseSetup) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: activePointerCollapseSetup.x,
    y: activePointerCollapseSetup.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: activePointerCollapseSetup.x,
    y: activePointerCollapseSetup.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const collapsed = await evaluate(`document.querySelector('[data-codex-live-activity="true"]')?.hasAttribute("data-condensed") || false`);
  const secondPointerTarget = await evaluate(`(() => {
    const toggle = document.querySelector('[data-codex-live-collapse-toggle="true"]');
    if (!toggle) return null;
    const rect = toggle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      hitToggle: hit === toggle || Boolean(hit?.closest?.('[data-codex-live-collapse-toggle="true"]')),
    };
  })()`);
  if (secondPointerTarget) {
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: secondPointerTarget.x,
      y: secondPointerTarget.y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: secondPointerTarget.x,
      y: secondPointerTarget.y,
      button: "left",
      clickCount: 1,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  const expanded = await evaluate(`document.querySelector('[data-codex-live-activity="true"]')?.hasAttribute("data-condensed") || false`);
  activePointerCollapseBehavior = { ...activePointerCollapseSetup, secondPointerTarget, collapsed, expanded };
}
await evaluate(`globalThis.__codexSurfaceLayoutController.setLiveActivityState("auto")`);
const collapseRemountBehavior = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState({ active: true, task: "Collapse remount QA", observedEvents: 0 });
  let widget = document.querySelector('[data-codex-live-activity="true"]');
  let toggle = widget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  if (!widget || !toggle) return null;
  if (widget.hasAttribute("data-condensed")) toggle.click();
  toggle.click();
  const beforeRemount = widget.hasAttribute("data-condensed");
  widget.remove();
  controller.refreshLiveActivity();
  widget = document.querySelector('[data-codex-live-activity="true"]');
  toggle = widget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  const afterRemount = widget?.hasAttribute("data-condensed") || false;
  toggle?.click();
  const expandedAfterToggle = !(widget?.hasAttribute("data-condensed") || false);
  toggle?.click();
  const collapsedAfterToggle = widget?.hasAttribute("data-condensed") || false;
  controller.setLiveActivityState("auto");
  return { beforeRemount, afterRemount, collapsedAfterToggle, expandedAfterToggle };
})()`);
const threadSwitchCollapseBehavior = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  const setThread = (taskId, task) => controller.setLiveActivityState({
    active: true,
    taskId,
    task,
    observedEvents: 1,
  });
  setThread("collapse-thread-a", "Thread A");
  let widget = document.querySelector('[data-codex-live-activity="true"]');
  let toggle = widget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  if (!widget || !toggle) return null;
  if (widget.hasAttribute("data-condensed")) toggle.click();
  toggle.click();
  const collapsedBeforeSwitch = widget.hasAttribute("data-condensed");
  setThread("collapse-thread-a", "Thread A updated content");
  const stableAfterContentRefresh = widget.hasAttribute("data-condensed");
  widget.remove();
  controller.refreshLiveActivity();
  widget = document.querySelector('[data-codex-live-activity="true"]');
  const stableAfterThreadRemount = widget?.hasAttribute("data-condensed") || false;
  setThread("collapse-thread-b", "Thread B");
  const newTaskExpanded = !(widget?.hasAttribute("data-condensed") || false);
  controller.setLiveActivityState("auto");
  return { collapsedBeforeSwitch, stableAfterContentRefresh, stableAfterThreadRemount, newTaskExpanded };
})()`);
const actualCollapseHeartbeatSetup = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState("auto");
  const widget = document.querySelector('[data-codex-live-activity="true"]');
  const toggle = widget?.querySelector('[data-codex-live-collapse-toggle="true"]');
  if (!widget || !toggle || widget.getAttribute("data-live-state") !== "active") {
    return { skipped: true };
  }
  if (widget.hasAttribute("data-condensed")) toggle.click();
  toggle.click();
  return { skipped: false };
})()`);
let actualCollapseHeartbeatBehavior = actualCollapseHeartbeatSetup;
if (actualCollapseHeartbeatSetup?.skipped === false) {
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const collapsedAfterHeartbeat = await evaluate(`(() => {
    const widget = document.querySelector('[data-codex-live-activity="true"]');
    const collapsed = widget?.hasAttribute("data-condensed") || false;
    if (collapsed) widget?.querySelector('[data-codex-live-collapse-toggle="true"]')?.click();
    return collapsed;
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const expandedAfterHeartbeat = await evaluate(`!(document.querySelector('[data-codex-live-activity="true"]')?.hasAttribute("data-condensed") || false)`);
  actualCollapseHeartbeatBehavior = { skipped: false, collapsedAfterHeartbeat, expandedAfterHeartbeat };
}
const runningTitleAppearance = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState({ active: true, task: "Running title appearance QA", observedEvents: 0 });
  const title = document.querySelector('[data-codex-live-title="true"]');
  if (!(title instanceof Element)) return { missing: true };
  const style = getComputedStyle(title);
  const dot = getComputedStyle(title, "::before");
  const result = {
    backgroundImage: style.backgroundImage,
    animationName: style.animationName,
    animationPlayState: style.animationPlayState,
    color: style.color,
    dotContent: dot.content,
    dotAnimationName: dot.animationName,
    dotAnimationDuration: dot.animationDuration,
    dotAnimationTimingFunction: dot.animationTimingFunction,
    dotTransform: dot.transform,
  };
  controller.setLiveActivityState("auto");
  return result;
})()`);
const completeTitleAppearance = await evaluate(`(() => {
  const controller = globalThis.__codexSurfaceLayoutController;
  controller.setLiveActivityState({ active: false, taskId: "complete-led", task: "Complete LED QA", observedEvents: 0 });
  const title = document.querySelector('[data-codex-live-title="true"]');
  if (!(title instanceof Element)) return { missing: true };
  const dot = getComputedStyle(title, "::before");
  const result = {
    dotAnimationName: dot.animationName,
    dotAnimationDuration: dot.animationDuration,
    dotOpacity: dot.opacity,
  };
  controller.setLiveActivityState("auto");
  return result;
})()`);
if (sampleState) {
  await evaluate(`globalThis.__codexSurfaceLayoutController.setLiveActivityState({
    active: true,
    task: "示例任务",
    tool: "shell_command",
    agents: [
      { name: "dom_probe", status: "done" },
      { name: "theme_worker", status: "running" },
      { name: "qa_review", status: "waiting" },
      { name: "package", status: "waiting" },
    ],
    total: 4,
    done: 1,
  })`);
}
await new Promise((resolve) => setTimeout(resolve, 120));

const result = await evaluate(`(() => {
  const root = document.documentElement;
  const widget = document.querySelector('[data-codex-live-activity="true"]');
  const context = document.querySelector('[data-codex-context-widget="true"]');
  const footer = document.querySelector('[data-codex-footer-telemetry="true"]');
  const progress = widget?.querySelector('[data-codex-live-progress="true"]');
  const widgetRect = widget?.getBoundingClientRect();
  const sidebarRect = document.querySelector('.app-shell-left-panel')?.getBoundingClientRect();
  const composerRect = document.querySelector('[data-composer-surface-variant]')?.getBoundingClientRect();
  const contextRect = context?.getBoundingClientRect();
  const contextPercent = Number(root.getAttribute('data-codex-context-percent'));
  const segments = progress?.querySelectorAll('[data-codex-live-progress-segment]').length || 0;
  return {
    mounted: Boolean(widget),
    inSidebar: Boolean(widget?.closest('.app-shell-left-panel')),
    footerRemoved: !footer,
    contextInComposer: Boolean(context?.closest('[data-composer-surface-variant]')),
    singleContextWidget: document.querySelectorAll('[data-codex-context-widget="true"]').length === 1,
    composerControlsIntact: Boolean(
      document.querySelector('[data-composer-navigation-target="add-context"]') &&
      document.querySelector('[data-composer-navigation-target="reasoning"]') &&
      document.querySelector('[data-composer-surface-variant] button[aria-label="听写"], [data-composer-surface-variant] button[aria-label="Dictate"]') &&
      document.querySelector('[data-composer-surface-variant] button[aria-label="停止"], [data-composer-surface-variant] button[aria-label="Stop"]')
    ),
    contextPercentValid: Number.isFinite(contextPercent) && contextPercent >= 0 && contextPercent <= 100,
    fourSegments: segments === 4,
    noSidebarOverflow: Boolean(widgetRect && sidebarRect && widgetRect.left >= sidebarRect.left && widgetRect.right <= sidebarRect.right),
    noComposerOverflow: Boolean(contextRect && composerRect && contextRect.left >= composerRect.left && contextRect.right <= composerRect.right),
    activitySource: root.getAttribute('data-codex-live-activity-source'),
    activityStage: Number(root.getAttribute('data-codex-live-stage') || 0),
    activityObservedEvents: Number(root.getAttribute('data-codex-live-observed-events') || 0),
    subtaskTotal: Number(root.getAttribute('data-codex-live-subtask-total') || 0),
    subtaskDone: Number(root.getAttribute('data-codex-live-subtask-done') || 0),
    taskText: widget?.querySelector('[data-codex-live-row="task"] [data-codex-live-row-value]')?.textContent || null,
    toolText: widget?.querySelector('[data-codex-live-row="tool"] [data-codex-live-row-value]')?.textContent || null,
    agentsText: widget?.querySelector('[data-codex-live-row="agents"] [data-codex-live-row-value]')?.textContent || null,
    modelText: widget?.querySelector('[data-codex-live-row="model"] [data-codex-live-row-value]')?.textContent || null,
    collapseToggleRevision: widget?.querySelector('[data-codex-live-collapse-toggle="true"]')
      ?.getAttribute("data-codex-live-collapse-revision") || null,
    collapseToggleOwner: widget?.querySelector('[data-codex-live-collapse-toggle="true"]')
      ?.getAttribute("data-codex-live-collapse-owner") || null,
  };
})()`);

const appearancePreferences = await evaluate(`(() => {
  const root = document.documentElement;
  const controller = globalThis.__codexSurfaceLayoutController;
  if (!controller?.setLiveActivityEnabled || !controller?.setLiveActivityAccent) {
    return { apiAvailable: false };
  }
  const originalEnabled = root.getAttribute("data-codex-live-activity-enabled") !== "false";
  const originalAccent = root.getAttribute("data-codex-live-activity-accent") || "violet";
  const independentBefore = {
    assistant: root.getAttribute("data-codex-assistant-indicator-enabled"),
    online: root.getAttribute("data-codex-online-core-enabled"),
    context: root.getAttribute("data-codex-context-accent"),
  };
  const defaultSignal = getComputedStyle(root).getPropertyValue("--codex-live-blue").trim();

  controller.setLiveActivityEnabled(false, false);
  const disabled = root.getAttribute("data-codex-live-activity-enabled") === "false" &&
    !document.querySelector('[data-codex-live-activity="true"]');
  controller.setLiveActivityEnabled(true, false);
  const enabled = root.getAttribute("data-codex-live-activity-enabled") === "true" &&
    Boolean(document.querySelector('[data-codex-live-activity="true"]'));

  const testAccent = originalAccent === "green" ? "violet" : "green";
  controller.setLiveActivityAccent(testAccent, false);
  const changedSignal = getComputedStyle(root).getPropertyValue("--codex-live-blue").trim();
  const accentChanged = root.getAttribute("data-codex-live-activity-accent") === testAccent &&
    changedSignal && changedSignal !== defaultSignal;
  const independentAfter = {
    assistant: root.getAttribute("data-codex-assistant-indicator-enabled"),
    online: root.getAttribute("data-codex-online-core-enabled"),
    context: root.getAttribute("data-codex-context-accent"),
  };

  controller.setLiveActivityAccent(originalAccent, false);
  controller.setLiveActivityEnabled(originalEnabled, false);
  return {
    apiAvailable: true,
    disabled,
    enabled,
    accentChanged,
    independent: JSON.stringify(independentBefore) === JSON.stringify(independentAfter),
  };
})()`);

await evaluate(`document.querySelector('[data-codex-context-widget="true"]')?.click(); true`);
await new Promise((resolve) => setTimeout(resolve, 40));
const paletteWorks = await evaluate(`(() => {
  const popover = document.querySelector('[data-codex-context-accent-popover="true"]');
  const opened = Boolean(popover && !popover.hidden && popover.querySelectorAll('[data-codex-context-accent-swatch]').length === 5);
  document.querySelector('[data-codex-context-widget="true"]')?.click();
  return opened;
})()`);
const adaptivePalette = await evaluate(`(() => {
  const root = document.documentElement;
  const originalClass = root.getAttribute("class");
  const read = () => {
    const style = getComputedStyle(root);
    return {
      panel: style.getPropertyValue("--codex-live-panel").trim(),
      text: style.getPropertyValue("--codex-live-text").trim(),
      liveAccent: style.getPropertyValue("--codex-live-blue").trim(),
      context: style.getPropertyValue("--codex-context-accent").trim(),
    };
  };
  root.classList.remove("electron-light");
  root.classList.add("dark", "electron-dark");
  const dark = read();
  root.classList.remove("dark", "electron-dark");
  root.classList.add("electron-light");
  const light = read();
  if (originalClass === null) root.removeAttribute("class");
  else root.setAttribute("class", originalClass);
  return dark.panel !== light.panel && dark.text !== light.text &&
    dark.liveAccent !== light.liveAccent && dark.context !== light.context;
})()`);
const independentOfSurface = await evaluate(`(() => {
  const root = document.documentElement;
  const controller = globalThis.__codexSurfaceLayoutController;
  const wasSurface = root.getAttribute("data-codex-surface-layout") === "surface";
  controller?.setSurfaceActive?.(false, false);
  const widget = document.querySelector('[data-codex-live-activity="true"]');
  const context = document.querySelector('[data-codex-context-widget="true"]');
  const visible = [widget, context].every((node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
  controller?.setSurfaceActive?.(wasSurface, false);
  return visible;
})()`);
await evaluate(`document.querySelector('[data-composer-navigation-target="add-context"]')?.click(); true`);
await new Promise((resolve) => setTimeout(resolve, 60));
const addContextOpens = await evaluate(`(() => {
  const button = document.querySelector('[data-composer-navigation-target="add-context"]');
  const opened = button?.getAttribute("aria-expanded") === "true" || button?.getAttribute("data-state") === "open";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return Boolean(opened);
})()`);

const checks = {
  mounted: result.mounted,
  inSidebar: result.inSidebar,
  footerRemoved: result.footerRemoved,
  contextInComposer: result.contextInComposer,
  singleContextWidget: result.singleContextWidget,
  composerControlsIntact: result.composerControlsIntact,
  paletteWorks,
  liveActivityPreferenceApi: appearancePreferences.apiAvailable,
  liveActivitySwitchWorks: appearancePreferences.disabled && appearancePreferences.enabled,
  liveActivityAccentWorks: appearancePreferences.accentChanged,
  liveActivityPreferencesIndependent: appearancePreferences.independent,
  adaptivePalette,
  independentOfSurface,
  addContextOpens,
  contextPercentValid: result.contextPercentValid,
  fourSegments: result.fourSegments,
  noSidebarOverflow: result.noSidebarOverflow,
  noComposerOverflow: result.noComposerOverflow,
  truthfulProgress: result.subtaskDone <= result.subtaskTotal,
  observableStageProgression: JSON.stringify(observableStageProgression.map((snapshot) => snapshot.states)) === JSON.stringify([
    ["running", "waiting", "waiting", "waiting"],
    ["done", "running", "waiting", "waiting"],
    ["done", "done", "running", "waiting"],
    ["done", "done", "done", "running"],
  ]) && observableStageProgression.every((snapshot, index) =>
    snapshot.label === "STATUS" && snapshot.value === "Running" && snapshot.state === "active" &&
    snapshot.source === "controller-preview" && snapshot.stage === index + 1),
  completionFrozen: completionBehavior.completed.state === "complete" &&
    completionBehavior.completed.title === "Complete" &&
    completionBehavior.completed.condensed &&
    completionBehavior.completed.stateText == null &&
    completionBehavior.completed.stateText === completionBehavior.frozen.stateText &&
    !completionBehavior.expanded.condensed,
  completionOmitsRuntime: completionBehavior.completed.stateText == null,
  activeManualCollapse: !activeCollapseBehavior.initial && activeCollapseBehavior.collapsed && !activeCollapseBehavior.expanded,
  activePointerManualCollapse: Boolean(activePointerCollapseBehavior) &&
    activePointerCollapseBehavior.rect.width >= 32 && activePointerCollapseBehavior.rect.height >= 32 &&
    activePointerCollapseBehavior.hitToggle && activePointerCollapseBehavior.pointerEvents === "auto" &&
    activePointerCollapseBehavior.secondPointerTarget?.hitToggle &&
    activePointerCollapseBehavior.collapsed !== activePointerCollapseBehavior.initial &&
    activePointerCollapseBehavior.expanded === activePointerCollapseBehavior.initial,
  currentCollapseToggleBound: result.collapseToggleRevision === "single-click-v5",
  currentCollapseToggleOwned: Boolean(result.collapseToggleOwner),
  liveActivityRefreshIsIdempotent: idempotentRefreshBehavior?.childListMutations === 0,
  collapseWorksAfterCardRemount: Boolean(
    collapseRemountBehavior?.beforeRemount && collapseRemountBehavior.afterRemount &&
    collapseRemountBehavior.collapsedAfterToggle && collapseRemountBehavior.expandedAfterToggle
  ),
  collapseStableAcrossThreadSwitch: Boolean(
    threadSwitchCollapseBehavior?.collapsedBeforeSwitch &&
    threadSwitchCollapseBehavior.stableAfterContentRefresh &&
    threadSwitchCollapseBehavior.stableAfterThreadRemount &&
    threadSwitchCollapseBehavior.newTaskExpanded
  ),
  actualCollapseStableAcrossHeartbeat: actualCollapseHeartbeatBehavior?.skipped === true || Boolean(
    actualCollapseHeartbeatBehavior?.collapsedAfterHeartbeat && actualCollapseHeartbeatBehavior.expandedAfterHeartbeat
  ),
  runningStatusDotBlinks: runningTitleAppearance.dotContent !== "none" &&
    runningTitleAppearance.dotAnimationName === "codex-live-running-dot" &&
    runningTitleAppearance.dotAnimationDuration === "0.5s" &&
    runningTitleAppearance.dotAnimationTimingFunction.startsWith("steps(1") &&
    runningTitleAppearance.dotTransform === "none",
  completeStatusDotIsStatic: completeTitleAppearance.dotAnimationName === "none",
  modelDetected: Boolean(result.modelText && result.modelText !== "—"),
  modelEffortCompact: String(result.modelText || "")
    .split(/\s+\+\s+/)
    .every((pair) => /\s(?:ULTRA|MAX|XH|H|M|L)$/.test(pair)),
};
console.log(JSON.stringify({
  passed: Object.values(checks).every(Boolean),
  checks,
  appearancePreferences,
  idempotentRefreshBehavior,
  observableStageProgression,
  completionBehavior,
  activeCollapseBehavior,
  activePointerCollapseBehavior,
  collapseRemountBehavior,
  threadSwitchCollapseBehavior,
  actualCollapseHeartbeatBehavior,
  runningTitleAppearance,
  completeTitleAppearance,
  ...result,
}, null, 2));
if (capturePath) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  fs.mkdirSync(path.dirname(capturePath), { recursive: true });
  fs.writeFileSync(capturePath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ screenshot: capturePath }));
}
if (sampleState) {
  await evaluate(`globalThis.__codexSurfaceLayoutController.setLiveActivityState("auto")`);
}
if (originalLiveActivityEnabled !== null) {
  await evaluate(`globalThis.__codexSurfaceLayoutController.setLiveActivityEnabled(${JSON.stringify(originalLiveActivityEnabled)}, false); true`);
}
socket.close();
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
