// Exercise the shipped frame governor with display clocks and a blocked UI.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = process.argv[2] || new URL("../engine/injector.mjs", import.meta.url);
const source = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
const start = source.indexOf("  const renderVoxOscilloscopes = ");
const end = source.indexOf("  const startVoxAnimation = ", start);
assert.ok(start >= 0 && end > start, "renderer exists");
const renderer = source.slice(start, end);

function simulation(hz, active = true, stall = false) {
  const frames = [];
  const canvas = { isConnected: true };
  let clock = 1000;
  const context = vm.createContext({
    document: { hidden: false },
    root: { getAttribute: () => active ? "active" : "idle" },
    performance: { now: () => clock },
    requestAnimationFrame: () => 1,
    stopVoxAnimation: () => {},
    isVoxSurfaceActive: () => true,
    canPaintPrism: () => false,
    drawPrismCanvas: () => {},
    unregisterVoxCanvas: () => {},
    voxMountedCanvases: new Set([canvas]),
    voxWorkerCanvases: new Map(),
    voxVisibleCanvases: new Set([canvas]),
    voxPaintedCanvases: new WeakSet(),
    drawVoxCanvas: () => frames.push({ at: clock, phase: vm.runInContext("voxTime", context) }),
  });
  vm.runInContext(`let voxAnimationFrame = 0, voxLastFrameTime = 0, voxNextFrameTime = 0;
    let voxTime = 0, voxPulsePhase = 0;
    const voxActiveFrameInterval = 1000 / 30, voxIdleFrameInterval = 1000 / 15;
    ${renderer}
    globalThis.render = renderVoxOscilloscopes;`, context);
  for (let tick = 0; tick < hz * 4; tick += 1) {
    clock = 1000 + tick * 1000 / hz;
    if (stall && clock > 2400 && clock < 2800) continue;
    context.render(clock);
  }
  const limit = active ? 30 : 15;
  if (!stall) assert.ok(Math.abs(frames.length / 4 - limit) <= 0.5, `${hz}Hz: ${frames.length / 4}fps`);
  assert.ok(frames.length <= limit * 4 + 1, "frame cap preserved");
  const maxPhaseStep = Math.max(...frames.slice(1).map((f, i) => f.phase - frames[i].phase));
  assert.ok(maxPhaseStep * 14 < 1.7, "upper harmonic must not alias or jump after a stall");
  const countBeforeHide = frames.length;
  context.document.hidden = true;
  context.render(clock + 1000);
  assert.equal(frames.length, countBeforeHide, "hidden page does not draw");
  return { hz, active, stall, fps: frames.length / 4, maxPhaseStep };
}

const results = [60, 75, 90, 120, 144, 165].flatMap(hz => [simulation(hz), simulation(hz, false)]);
results.push(simulation(60, true, true));
console.log(JSON.stringify(results, null, 2));
console.log("VOX_PACING_QA=PASS");
