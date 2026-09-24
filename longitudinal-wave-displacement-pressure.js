import {
  DEFAULT_WAVE,
  densityMarkers,
  displacementAt,
  particlePosition,
  pressureAt,
  sampleProbe,
} from './longitudinal-wave-physics.js';
import {
  DEFAULT_STATE,
  advanceState,
  resetState,
  setProbe,
  toggleLayer,
  togglePlaying,
} from './longitudinal-wave-state.js';

const canvas = document.querySelector('#longitudinalWaveCanvas');
const context = canvas.getContext('2d');
const speedControl = document.querySelector('#speedControl');
const speedOutput = document.querySelector('#speedOutput');
const playButton = document.querySelector('#playButton');
const resetButton = document.querySelector('#resetButton');
const helpButton = document.querySelector('#helpButton');
const helpDialog = document.querySelector('#helpDialog');
const closeHelpButton = document.querySelector('#closeHelpButton');

const layerControls = {
  waveform: document.querySelector('#waveformToggle'),
  displacement: document.querySelector('#displacementToggle'),
  pressure: document.querySelector('#pressureToggle'),
  probe: document.querySelector('#probeToggle'),
  guides: document.querySelector('#guidesToggle'),
};

let state = { ...DEFAULT_STATE, layers: { ...DEFAULT_STATE.layers } };
let lastFrame = performance.now();
let dragging = false;

const palette = {
  ink: '#173a61',
  muted: '#71839a',
  line: '#bdd0e5',
  cyan: '#11a8b1',
  cyanSoft: '#c8f1f2',
  yellow: '#e8a61c',
  coral: '#e77761',
  blue: '#3979e8',
  white: '#ffffff',
};

function line(context2d, x1, y1, x2, y2, color, width = 1, dash = []) {
  context2d.save();
  context2d.strokeStyle = color;
  context2d.lineWidth = width;
  context2d.setLineDash(dash);
  context2d.beginPath();
  context2d.moveTo(x1, y1);
  context2d.lineTo(x2, y2);
  context2d.stroke();
  context2d.restore();
}

function label(context2d, text, x, y, color = palette.ink, align = 'left', size = 13) {
  context2d.save();
  context2d.fillStyle = color;
  context2d.font = `700 ${size}px Arial, "Microsoft JhengHei", sans-serif`;
  context2d.textAlign = align;
  context2d.textBaseline = 'middle';
  context2d.fillText(text, x, y);
  context2d.restore();
}

function drawCurve(context2d, left, right, centerY, scale, sampler, time, color) {
  context2d.save();
  context2d.strokeStyle = color;
  context2d.lineWidth = 3;
  context2d.lineJoin = 'round';
  context2d.beginPath();
  for (let x = left; x <= right; x += 2) {
    const value = sampler(x - left, time);
    const y = centerY - value * scale;
    if (x === left) context2d.moveTo(x, y);
    else context2d.lineTo(x, y);
  }
  context2d.stroke();
  context2d.restore();
}

function drawCross(context2d, x, y, color = palette.yellow) {
  context2d.save();
  context2d.strokeStyle = color;
  context2d.fillStyle = color;
  context2d.lineWidth = 3;
  context2d.beginPath();
  context2d.moveTo(x - 10, y);
  context2d.lineTo(x + 10, y);
  context2d.moveTo(x, y - 10);
  context2d.lineTo(x, y + 10);
  context2d.stroke();
  context2d.beginPath();
  context2d.arc(x, y, 4, 0, Math.PI * 2);
  context2d.fill();
  context2d.restore();
}

function drawRangeBracket(context2d, centerX, centerY, halfRange, orientation) {
  const cap = 9;
  context2d.save();
  context2d.strokeStyle = palette.coral;
  context2d.lineWidth = 2.5;
  context2d.beginPath();
  if (orientation === 'horizontal') {
    context2d.moveTo(centerX - halfRange, centerY);
    context2d.lineTo(centerX + halfRange, centerY);
    context2d.moveTo(centerX - halfRange, centerY - cap);
    context2d.lineTo(centerX - halfRange, centerY + cap);
    context2d.moveTo(centerX + halfRange, centerY - cap);
    context2d.lineTo(centerX + halfRange, centerY + cap);
  } else {
    context2d.moveTo(centerX, centerY - halfRange);
    context2d.lineTo(centerX, centerY + halfRange);
    context2d.moveTo(centerX - cap, centerY - halfRange);
    context2d.lineTo(centerX + cap, centerY - halfRange);
    context2d.moveTo(centerX - cap, centerY + halfRange);
    context2d.lineTo(centerX + cap, centerY + halfRange);
  }
  context2d.stroke();
  context2d.restore();
}

function drawParticleField(context2d, left, right, top, bottom, time, showWaveform) {
  const width = right - left;
  context2d.save();
  context2d.fillStyle = '#10233d';
  context2d.fillRect(left, top, width, bottom - top);

  if (showWaveform) {
    context2d.strokeStyle = 'rgba(211,239,255,.72)';
    context2d.lineWidth = 1.2;
    for (let equilibrium = 0; equilibrium <= width; equilibrium += 12) {
      const x = left + particlePosition(equilibrium, time);
      context2d.beginPath();
      context2d.moveTo(x, top + 16);
      context2d.lineTo(x, top + 67);
      context2d.stroke();
    }
  }

  context2d.fillStyle = '#eaf8ff';
  for (let index = 0; index < 560; index += 1) {
    const equilibrium = (index * 37) % Math.ceil(width);
    const x = left + particlePosition(equilibrium, time);
    const y = top + 78 + ((index * 29) % Math.max(1, Math.floor(bottom - top - 90)));
    context2d.fillRect(x, y, 1.6, 1.6);
  }
  context2d.restore();
}

function drawGuides(context2d, left, top, bottom, width, time) {
  const { compression, rarefaction } = densityMarkers(width, time, DEFAULT_WAVE);
  for (const x of rarefaction) {
    line(context2d, left + x, top, left + x, bottom, palette.blue, 1.8, [6, 5]);
    label(context2d, '疏', left + x, top + 12, palette.blue, 'center', 12);
  }
  for (const x of compression) {
    line(context2d, left + x, top, left + x, bottom, palette.coral, 1.8, [6, 5]);
    label(context2d, '密', left + x, top + 12, palette.coral, 'center', 12);
  }
}

function draw(stateToDraw) {
  const { width, height } = canvas;
  const left = 64;
  const right = width - 22;
  const fieldTop = 38;
  const fieldBottom = 225;
  const displacementY = 360;
  const pressureY = 535;
  const graphScale = 1.35;
  const plotWidth = right - left;
  const probeX = Math.min(right, Math.max(left, stateToDraw.probeX));
  const probe = sampleProbe(probeX - left, stateToDraw.phase, DEFAULT_WAVE);

  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f7fbff';
  context.fillRect(0, 0, width, height);
  drawParticleField(
    context,
    left,
    right,
    fieldTop,
    fieldBottom,
    stateToDraw.phase,
    stateToDraw.layers.waveform,
  );

  if (stateToDraw.layers.guides) drawGuides(context, left, 24, height - 24, plotWidth, stateToDraw.phase);

  line(context, left, fieldBottom + 12, right, fieldBottom + 12, palette.line, 1);
  label(context, '空氣粒子與波形', left, 18, palette.ink, 'left', 14);

  line(context, left, displacementY, right, displacementY, palette.line, 1.5);
  line(context, left, pressureY, right, pressureY, palette.line, 1.5);
  label(context, '右', 15, displacementY - 39, palette.ink, 'left', 14);
  label(context, '位移', 15, displacementY, palette.ink, 'left', 14);
  label(context, '左', 15, displacementY + 39, palette.ink, 'left', 14);
  label(context, '+ΔP', 10, pressureY - 38, palette.ink, 'left', 13);
  label(context, 'P₀', 28, pressureY, palette.ink, 'left', 14);
  label(context, '−ΔP', 10, pressureY + 38, palette.ink, 'left', 13);

  if (stateToDraw.layers.waveform) {
    label(context, '波形', left + 3, fieldTop + 25, '#d9f6ff', 'left', 12);
  }
  if (stateToDraw.layers.displacement) {
    drawCurve(context, left, right, displacementY, graphScale, displacementAt, stateToDraw.phase, palette.cyan);
  }
  if (stateToDraw.layers.pressure) {
    drawCurve(context, left, right, pressureY, graphScale, pressureAt, stateToDraw.phase, palette.yellow);
  }

  if (stateToDraw.layers.probe) {
    line(context, probeX, 18, probeX, height - 18, palette.cyan, 3);
    label(context, '可拖曳觀察點', probeX, 18, palette.ink, 'center', 13);
    drawRangeBracket(context, probeX, fieldTop + 112, DEFAULT_WAVE.amplitude, 'horizontal');
    drawCross(context, left + probe.particleX, fieldTop + 112);
    if (stateToDraw.layers.displacement) {
      drawRangeBracket(context, probeX, displacementY, DEFAULT_WAVE.amplitude * graphScale, 'vertical');
      drawCross(context, probeX, displacementY - probe.displacement * graphScale);
    }
    if (stateToDraw.layers.pressure) drawCross(context, probeX, pressureY - probe.pressure * graphScale);
  }

  label(context, '拖曳青色線，觀察黃色標記的振動', right, height - 12, palette.muted, 'right', 12);
}

function updateControls() {
  playButton.textContent = state.playing ? '暫停' : '播放';
  playButton.setAttribute('aria-pressed', String(state.playing));
  speedOutput.value = `${state.speed.toFixed(1)}×`;
  speedOutput.textContent = `${state.speed.toFixed(1)}×`;
  speedControl.value = String(state.speed);
  for (const [name, control] of Object.entries(layerControls)) control.checked = state.layers[name];
}

function updateProbe(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
  state = setProbe(state, x, canvas.width);
}

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  updateProbe(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (dragging) updateProbe(event);
});

canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

speedControl.addEventListener('input', () => {
  state = { ...state, speed: Number(speedControl.value) };
  updateControls();
});

playButton.addEventListener('click', () => {
  state = togglePlaying(state);
  updateControls();
});

resetButton.addEventListener('click', () => {
  state = resetState();
  updateControls();
});

for (const [name, control] of Object.entries(layerControls)) {
  control.addEventListener('change', () => {
    state = toggleLayer(state, name, control.checked);
  });
}

helpButton.addEventListener('click', () => helpDialog.showModal());
closeHelpButton.addEventListener('click', () => helpDialog.close());

function frame(now) {
  state = advanceState(state, (now - lastFrame) / 1000);
  lastFrame = now;
  draw(state);
  requestAnimationFrame(frame);
}

updateControls();
requestAnimationFrame(frame);
