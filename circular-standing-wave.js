import {
  MODES, getModeById, modeSummary, normalizeSpeed, waveDisplacement,
} from './circular-standing-wave-physics.js';

const canvas = document.querySelector('#membraneCanvas');
const stage = document.querySelector('.stage');
const controls = document.querySelector('.controls');
const fallbackNotice = document.querySelector('#fallbackNotice');
const modeControl = document.querySelector('#modeControl');
const speedControl = document.querySelector('#speedControl');
const playButton = document.querySelector('#playButton');
const resetButton = document.querySelector('#resetButton');
const summary = document.querySelector('#modeSummary');
const context = canvas?.getContext('2d');

const state = {
  mode: MODES[0], playing: true, speed: 1, phase: 0, lastTime: null, size: 0,
};

function updateControls() {
  modeControl.value = state.mode.id;
  speedControl.value = String(state.speed);
  playButton.textContent = state.playing ? '暫停' : '播放';
  playButton.setAttribute('aria-pressed', String(state.playing));
  summary.innerHTML = `<b>${state.mode.label}</b><br>${modeSummary(state.mode)}`;
}

function populateModes() {
  for (const mode of MODES) {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label;
    modeControl.append(option);
  }
}

function measureCanvas() {
  const nextSize = Math.max(280, Math.min(canvas.parentElement.clientWidth - 24, 720));
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(nextSize * pixelRatio);
  if (canvas.width !== width || canvas.height !== width) {
    canvas.width = width;
    canvas.height = width;
    canvas.style.width = `${nextSize}px`;
    canvas.style.height = `${nextSize}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  state.size = nextSize;
}

function displacementColor(value) {
  const magnitude = Math.min(1, Math.abs(value));
  if (magnitude < 0.045) return '#f6f8fc';
  const lightness = Math.round(86 - magnitude * 30);
  return value >= 0 ? `hsl(211 86% ${lightness}%)` : `hsl(8 78% ${lightness}%)`;
}

function drawMembrane() {
  const { size } = state;
  const center = size / 2;
  const radius = size * 0.44;
  const cellSize = 4;
  context.clearRect(0, 0, size, size);

  for (let y = 0; y < size; y += cellSize) {
    for (let x = 0; x < size; x += cellSize) {
      const dx = (x + cellSize / 2 - center) / radius;
      const dy = (y + cellSize / 2 - center) / radius;
      const normalizedRadius = Math.hypot(dx, dy);
      if (normalizedRadius >= 1) continue;
      const value = waveDisplacement(state.mode, normalizedRadius, Math.atan2(dy, dx), state.phase);
      context.fillStyle = displacementColor(value);
      context.fillRect(x, y, cellSize + 0.5, cellSize + 0.5);
    }
  }

  context.strokeStyle = '#274d78';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();
}

function renderFrame(timestamp) {
  if (state.lastTime !== null && state.playing) {
    state.phase += (timestamp - state.lastTime) * 0.004 * state.speed;
  }
  state.lastTime = timestamp;
  measureCanvas();
  drawMembrane();
  requestAnimationFrame(renderFrame);
}

function reset() {
  state.mode = MODES[0];
  state.playing = true;
  state.speed = 1;
  state.phase = 0;
  updateControls();
}

function setPlaying(isPlaying) {
  state.playing = Boolean(isPlaying);
  updateControls();
}

function bindControls() {
  modeControl.addEventListener('change', () => {
    state.mode = getModeById(modeControl.value);
    state.phase = 0;
    updateControls();
  });
  speedControl.addEventListener('change', () => {
    state.speed = normalizeSpeed(speedControl.value);
    updateControls();
  });
  playButton.addEventListener('click', () => setPlaying(!state.playing));
  resetButton.addEventListener('click', reset);
  window.addEventListener('resize', measureCanvas);
}

if (!context) {
  stage.classList.add('canvas-unavailable');
  controls.hidden = true;
  fallbackNotice.hidden = false;
} else {
  populateModes();
  bindControls();
  updateControls();
  requestAnimationFrame(renderFrame);
  window.CircularStandingWaveApp = { reset, setPlaying };
}
