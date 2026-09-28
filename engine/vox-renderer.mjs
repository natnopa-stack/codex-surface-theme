// Local decorative rendering only: no network, model calls or external service.
// All transferred VOX canvases share this worker's one animation loop.
export function voxWorkerMain(paintFrame) {
  const canvases = new Map();
  let running = false, active = false, light = false;
  let frame = 0, last = 0, next = 0, time = 0, pulse = 0;
  let stats = { frames: 0, maxGap: 0, gapsOver75: 0, started: performance.now() };
  const requestFrame = typeof requestAnimationFrame === "function"
    ? fn => requestAnimationFrame(fn)
    : fn => setTimeout(() => fn(performance.now()), active ? 1000 / 30 : 1000 / 15);
  const cancelFrame = typeof cancelAnimationFrame === "function"
    ? id => cancelAnimationFrame(id) : id => clearTimeout(id);
  const visible = () => running && [...canvases.values()].some(c => c.visible && c.width > 0 && c.height > 0);
  const stop = () => { if (frame) cancelFrame(frame); frame = 0; last = 0; next = 0; };
  const draw = now => {
    frame = 0;
    if (!visible()) { stop(); return; }
    const interval = active ? 1000 / 30 : 1000 / 15;
    if (next && now + 0.75 < next) { frame = requestFrame(draw); return; }
    const elapsed = last ? now - last : interval;
    const step = Math.min(elapsed, interval * 1.5);
    next = (next || now) + interval;
    if (next < now) next = now + interval;
    if (last) { stats.maxGap = Math.max(stats.maxGap, elapsed); if (elapsed > 75) stats.gapsOver75++; }
    last = now;
    const speed = active ? 1 : 0.32;
    time += 2.4 * speed * step / 1000;
    pulse += 1.5 * speed * step / 1000;
    for (const entry of canvases.values()) {
      if (!entry.visible || entry.width <= 0 || entry.height <= 0) continue;
      paintFrame(entry.context, entry.width, entry.height, entry.dpr, {
        time, pulse, active, light, location: entry.location,
      });
    }
    stats.frames++;
    frame = requestFrame(draw);
  };
  const sync = () => { if (!visible()) stop(); else if (!frame) frame = requestFrame(draw); };
  const resize = (entry, values) => {
    Object.assign(entry, values);
    const w = Math.max(1, Math.round(entry.width * entry.dpr));
    const h = Math.max(1, Math.round(entry.height * entry.dpr));
    if (entry.canvas.width !== w) entry.canvas.width = w;
    if (entry.canvas.height !== h) entry.canvas.height = h;
  };
  self.onmessage = ({ data }) => {
    if (data.type === "add") {
      const context = data.canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!context) throw new Error("VOX worker could not create its canvas context");
      const entry = { canvas: data.canvas, context };
      resize(entry, data.values); canvases.set(data.id, entry);
    } else if (data.type === "update") {
      const entry = canvases.get(data.id); if (entry) resize(entry, data.values);
    } else if (data.type === "remove") {
      const entry = canvases.get(data.id);
      if (entry) { entry.canvas.width = 1; entry.canvas.height = 1; }
      canvases.delete(data.id);
    } else if (data.type === "state") {
      running = data.running; active = data.active; light = data.light;
    } else if (data.type === "inspect") {
      self.postMessage({ type: "inspect", id: data.id, ...stats,
        elapsed: performance.now() - stats.started, running: visible(), active, canvases: canvases.size });
      if (data.reset) stats = { frames: 0, maxGap: 0, gapsOver75: 0, started: performance.now() };
      return;
    }
    sync();
  };
}

// The idle branch retains the accepted 1.15.8 geometry, energy and motion.
export function paintVoxFrame(context, width, height, pixelRatio, state) {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const centerY = height / 2;
    // Interpolated noise varies each active peak without per-frame random jumps.
    const noise = (position, seed) => {
      const i = Math.floor(position), f = position - i, blend = f * f * (3 - 2 * f);
      const hash = n => { const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
      return hash(i) * (1 - blend) + hash(i + 1) * blend;
    };
    const waveCenter = width / 2 + (state.active ? noise(state.time * 0.31, 2) * Math.min(12, width * 0.04) : 0);
    const activeSignal = state.active;
    const voxTime = state.time;
    const voxPulsePhase = state.pulse;
    const breath = (Math.sin(voxPulsePhase) + 1) / 2;
    const signalEnergy = activeSignal
      ? 0.9 + noise(voxTime * 0.47, 5) * 0.1
      : 0.16 + breath * 0.08;
    const signalOpacity = activeSignal ? 1 : 0.44;
    const envelopeDenominator = Math.max(220, width * width * 0.0065) * (activeSignal ? 1 + noise(voxTime * 0.37, 8) * 0.22 : 1);
    const frequency = activeSignal ? 0.32 + noise(voxTime * 0.23, 11) * 0.035 : 0.32;
    const phaseWander = activeSignal ? noise(voxTime * 0.61, 13) * 1.2 : 0;
    const lightMode = state.light;
    const baselineColor = lightMode
      ? "rgba(91, 33, 182, 0.24)"
      : "rgba(192, 132, 252, 0.2)";
    const coreColor = lightMode ? "#5b21b6" : "#ffffff";
    const glowColor = lightMode ? "#8b5cf6" : "#c084fc";
    const voxLocation = state.location;

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
      const fundamental = Math.sin(distance * frequency - voxTime * 6 + phaseWander) * (activeSignal ? 8 : 7.5);
      const harmonic = Math.sin(distance * 0.78 + voxTime * 10 - phaseWander * 0.7) * (activeSignal ? 3.8 : 3.5);
      // A low-amplitude smooth upper harmonic adds live electrical movement
      // without turning the accepted plasma filament into a jagged polyline.
      const transient = activeSignal
        ? noise(distance * 0.14 + voxTime * 1.1, 17) * 2.1
        : 0;
      // Keep fine electrical grain continuous between frames, not random jumps.
      const microJitter = Math.sin(distance * 2.17 + voxTime * 3.3) * 0.75;
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
}
