// Isolated synthetic-DOM regression. Never connects to a user's Codex window.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = process.argv[2] || path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe");
if (!fs.existsSync(browser)) throw new Error("Pass the installed Edge/Chromium executable as the first argument.");
const output = path.resolve(process.argv[3] || path.join(root, "qa/artifacts/dark-release"));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "surface-dark-qa-"));
let source = fs.readFileSync(path.join(root, "engine/injector.mjs"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^import .*;\n/gm, "")
  .replace("const here = path.dirname(fileURLToPath(import.meta.url));", "const here = " + JSON.stringify(path.join(root, "engine")) + ";");
const cliStart = source.lastIndexOf('\ntry {\n  if (mode === "watch")');
if (cliStart < 0) throw new Error("Cannot isolate injector expression without running its CLI.");
const context = vm.createContext({ fs, path, Buffer, process: { argv: [] } });
vm.runInContext(source.slice(0, cliStart) + "\nglobalThis.expression = buildApplyExpression();", context);
new vm.Script(context.expression);

const html = `<!doctype html><html data-theme="dark"><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#101010;color:#eee;font:14px Arial}button,input{font:inherit}button{cursor:pointer}
.app-shell-left-panel{position:fixed;inset:0 auto 0 0;width:330px;background:#1b1b1b;padding:12px 12px 12px 58px}
[data-app-navigation-rail]{position:fixed;left:6px;top:8px;bottom:8px;width:36px;display:flex;flex-direction:column;gap:8px}
#rail-space{flex:1}#footer{display:flex;flex-direction:column;gap:8px}#footer button{width:36px;height:36px;flex-shrink:0}
.nav-header{display:flex;align-items:center;gap:6px;height:44px}.nav-header>span{display:contents}
main{margin-left:355px;width:760px;padding:20px}#mode-card{background:#222;padding:16px;border-radius:12px;margin-bottom:12px}
.native-row{display:flex;justify-content:space-between;align-items:center}.native-mode{display:flex;gap:12px}
#composer-host{position:relative;margin-top:22px;border-radius:15px;background:#252525;padding:16px}textarea{width:100%;height:72px;background:transparent;color:inherit}
#context{display:inline-block;width:22px;height:24px}#context svg{width:18px;height:18px}#controls{display:flex;align-items:center;gap:12px}#native-menu{position:absolute;bottom:46px;left:16px;background:#333;padding:12px}#native-menu[hidden]{display:none}
</style><body><aside class="app-shell-left-panel"><div data-app-navigation-rail="true"><button>Home</button><div id="rail-space"></div><div id="footer"><button aria-label="Open help menu">?</button><button aria-label="Open profile menu" onclick="window.profileClicks=(window.profileClicks||0)+1">U</button></div></div><div class="nav-header @container/navigation-header"><span><button aria-label="Switch mode">Codex</button></span></div><p>Simulated project list</p></aside><main><div id="mode-card"><div class="native-row @container/settings-row"><strong>Mode</strong><div role="radiogroup" class="native-mode"><label><input name="appearance-theme" type="radio" aria-label="Dark" checked>Dark</label><label><input name="appearance-theme" type="radio" aria-label="Light">Light</label></div></div></div><div id="composer-host"><div data-composer-surface-variant="default"><textarea aria-label="Message"></textarea><div id="controls"><button id="native-plus" onclick="document.querySelector('#native-menu').hidden=false">+</button><span id="context" title="Native context"><span role="img" aria-label="Context usage 35%"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"></circle><circle cx="10" cy="10" r="8"></circle></svg></span></span><span>Model</span><button>Mic</button><button>Send</button></div><div id="native-menu" hidden>Native fixture menu</div></div></div></main><script>localStorage.setItem('codex.surface-layout.v2','surface');</script></body></html>`;
const server = http.createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const child = spawn(browser, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1280,1100", "about:blank"], { windowsHide: true, stdio: "ignore" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, send;
try {
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  const port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener("message", event => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    const item = pending.get(msg.id);
    if (!item) return;
    pending.delete(msg.id); clearTimeout(item.timer);
    msg.error ? item.reject(new Error(msg.error.message)) : item.resolve(msg.result);
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + " timed out")); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
  for (let i = 0; i < 50 && !await evaluate("Boolean(document.querySelector('#context'))"); i++) await delay(100);
  const nativeModeWidth = await evaluate("document.querySelector('.native-mode').getBoundingClientRect().width");
  await evaluate(context.expression);
  await delay(800);
  await evaluate(`window.c=globalThis.__codexSurfaceLayoutController;c.setSurfaceActive(true,false);c.setOnlineCoreEnabled(true,false);c.setOnlineCoreState('active');c.setUsageGaugeMode('precise',false);c.setComposerEffect('sparkles',false)`);
  await delay(300);
  const inspect = () => evaluate(`(() => {
    const q=s=>document.querySelector(s), r=n=>n.getBoundingClientRect().toJSON();
    const section=q('[data-codex-appearance-controls]'),gauge=q('[data-codex-usage-gauge]'),profile=q('[aria-label="Open profile menu"]'),mark=q('[data-codex-online-core-mark]');
    const rows=[...section.children].map(n=>({rect:r(n),scroll:n.scrollWidth,width:n.clientWidth}));
    return {layout:document.documentElement.getAttribute('data-codex-surface-layout'),section:r(section),rows,mode:r(q('.native-mode')),gauge:r(gauge),profile:r(profile),placement:gauge.dataset.placement,active:getComputedStyle(mark).animationDuration,idle:getComputedStyle(document.documentElement).getPropertyValue('--codex-online-core-idle-duration').trim(),transform:getComputedStyle(mark).transform,lightControls:document.querySelectorAll('[data-codex-light-style-control],[data-codex-prism-canvas]').length};
  })()`);
  const wide = await inspect();
  await delay(200);
  const motion = (await inspect()).transform !== wide.transform;
  await evaluate("document.querySelector('main').style.width='360px'");
  await delay(150);
  const narrow = await inspect();
  const picture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(output, "dark-settings.png"), Buffer.from(picture.data, "base64"));
  const switches = await evaluate(`(() => { c.setAssistantIndicatorEnabled(false,false);c.setOnlineCoreEnabled(true,false);const independent=document.documentElement.getAttribute('data-codex-online-core-enabled')==='true';c.setComposerEffectEnabled(false,false);const off=!document.querySelector('[data-codex-composer-sparkles]');c.setComposerEffectEnabled(true,false);return {independent,off,on:Boolean(document.querySelector('[data-codex-composer-sparkles]'))};})()`);
  await evaluate("document.documentElement.setAttribute('data-theme','light')");
  await delay(150);
  const light = await evaluate(`({layout:document.documentElement.getAttribute('data-codex-surface-layout'),sparkles:!!document.querySelector('[data-codex-composer-sparkles]'),context:document.querySelector('#context').outerHTML,coreDisplay:getComputedStyle(document.querySelector('[data-codex-online-core]')).display,gaugeDisplay:getComputedStyle(document.querySelector('[data-codex-usage-gauge]')).display})`);
  await evaluate("document.documentElement.setAttribute('data-theme','dark')");
  await delay(150);
  const restored = await evaluate("document.documentElement.getAttribute('data-codex-surface-layout')==='surface'");
  await evaluate("c.setSurfaceActive(false,false)");
  const official = await evaluate("!document.documentElement.hasAttribute('data-codex-surface-layout')&&!document.querySelector('[data-codex-context-widget]')&&!document.querySelector('[data-codex-composer-sparkles]')");
  await evaluate("c.setSurfaceActive(true,false);document.querySelector('main').style.width='760px'");
  await evaluate(context.expression);
  await delay(250);
  const unique = await evaluate("document.querySelectorAll('[data-codex-appearance-controls]').length===1&&document.querySelectorAll('[data-codex-usage-gauge]').length===1&&document.querySelectorAll('[data-codex-online-core]').length===1");
  const click = async selector => {
    const point = await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  };
  await click('#native-plus');
  await click('[aria-label="Open profile menu"]');
  await click('textarea');
  await send('Input.insertText', { text: 'fixture input' });
  const input = await evaluate("!document.querySelector('#native-menu').hidden&&window.profileClicks===1&&document.querySelector('textarea').value==='fixture input'");
  await evaluate("globalThis.__codexSurfaceLayoutController.destroy()");
  const removed = await evaluate("!document.querySelector('[data-codex-appearance-controls],[data-codex-composer-sparkles],[data-codex-usage-gauge],[data-codex-context-widget]')");
  const fits = state => state.rows.length===6 && state.rows.every((row,i) => row.scroll<=row.width+1 && row.rect.width>=state.section.width-2 && (!i || row.rect.y>=state.rows[i-1].rect.bottom));
  const checks = { wideSettings:fits(wide),narrowSettings:fits(narrow),modeNotSqueezed:Math.abs(wide.mode.width-nativeModeWidth)<1,quotaSeparate:wide.placement==='navigation-rail'&&wide.gauge.bottom<=wide.profile.y&&wide.profile.width===36,riderSpeed:wide.active==='3.2s'&&wide.idle==='5.6s',animationMoves:motion,noLightFeature:wide.lightControls===0,independentSwitch:switches.independent,composerToggle:switches.off&&switches.on,nativeLight:!light.layout&&!light.sparkles&&light.coreDisplay==='none'&&light.gaugeDisplay==='none'&&!light.context.includes('data-codex-context-widget')&&light.context.includes('title="Native context"'),darkRestores:restored,official,reinjectionUnique:unique,nativeFixtureInput:input,unmount:removed,noRuntimeErrors:errors.length===0};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,wide,narrow,light,errors},null,2));
  console.log(JSON.stringify({checks,output},null,2));
  if(Object.values(checks).some(v=>!v))process.exitCode=1;
} finally {
  try { if(send)await send('Browser.close'); } catch {}
  socket?.close(); server.close();
  if(child.exitCode===null)child.kill();
}
