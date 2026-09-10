import {
  calculateBoundary,
  createStringState,
  pulseSample,
  sampleShape,
  sanitizeDensities,
  stepStringState,
} from './string-wave-physics.js';

const tension = 100;
const length = 20;
const pointCount = 300;
const canvas = document.querySelector('#waveCanvas');
const context = canvas.getContext('2d');
const controls = {
  muLeft: document.querySelector('#muLeft'),
  muRight: document.querySelector('#muRight'),
  signalType: document.querySelector('#signalType'),
  shape: document.querySelector('#shape'),
  amplitude: document.querySelector('#amplitude'),
  timeControl: document.querySelector('#timeControl'),
  timeLabel: document.querySelector('#timeLabel'),
  play: document.querySelector('#playButton'),
  reset: document.querySelector('#resetButton'),
  slow: document.querySelector('#slowButton'),
  derivation: document.querySelector('#derivationLink'),
};
const state = {
  mode: 'numeric',
  playing: true,
  slow: false,
  muLeft: 1,
  muRight: 4,
  signalType: 'pulse',
  shape: 'sine',
  amplitude: 0.65,
  timeControl: 1.2,
  elapsed: 0,
  engine: null,
};
let lastTimestamp = performance.now();

function readSettingsFromUrl() {
  const params = new URLSearchParams(location.search);
  const densities = sanitizeDensities(Number(params.get('muLeft')), Number(params.get('muRight')));
  state.muLeft = densities.muLeft;
  state.muRight = densities.muRight;
}

function coefficients() {
  return calculateBoundary(state.muLeft, state.muRight, tension);
}

function updateControls() {
  controls.muLeft.value = state.muLeft;
  controls.muRight.value = state.muRight;
  controls.signalType.value = state.signalType;
  controls.shape.value = state.shape;
  controls.amplitude.value = state.amplitude;
  controls.timeControl.value = state.timeControl;
  document.querySelector('#muLeftValue').textContent = state.muLeft.toFixed(2);
  document.querySelector('#muRightValue').textContent = state.muRight.toFixed(2);
  document.querySelector('#amplitudeValue').textContent = state.amplitude.toFixed(2);
  document.querySelector('#timeValue').textContent = state.timeControl.toFixed(state.signalType === 'pulse' ? 2 : 1);
  controls.timeLabel.firstChild.textContent = state.signalType === 'pulse' ? '脈波寬度 ' : '頻率 ';
  controls.derivation.href = `./string-wave-derivation.html?muLeft=${state.muLeft}&muRight=${state.muRight}`;
}

function refreshReadouts() {
  const c = coefficients();
  const values = {
    vLeft: c.vLeft.toFixed(2),
    vRight: c.vRight.toFixed(2),
    r: c.amplitudeReflection.toFixed(3),
    t: c.amplitudeTransmission.toFixed(3),
    R: `${(c.energyReflection * 100).toFixed(1)}%`,
    tau: `${(c.energyTransmission * 100).toFixed(1)}%`,
    sum: `${((c.energyReflection + c.energyTransmission) * 100).toFixed(1)}%`,
  };
  document.querySelectorAll('[data-readout]').forEach((node) => {
    node.textContent = values[node.dataset.readout];
  });
}

function pulseAt(position, center, amplitude = state.amplitude) {
  return amplitude * pulseSample(state.shape, position - center, state.timeControl);
}

function initialisePulse() {
  const c = coefficients();
  const initialCenter = length * 0.26;
  const stateNow = state.engine;
  for (let index = 0; index < stateNow.y.length; index += 1) {
    const position = index * stateNow.dx;
    stateNow.y[index] = pulseAt(position, initialCenter);
    stateNow.previousY[index] = pulseAt(position + c.vLeft * stateNow.dt, initialCenter);
  }
}

function resetEngine() {
  state.elapsed = 0;
  state.engine = createStringState({
    muLeft: state.muLeft,
    muRight: state.muRight,
    tension,
    pointCount,
    length,
  });
  if (state.signalType === 'pulse') initialisePulse();
  refreshReadouts();
}

function applyScenario(name) {
  const scenarios = {
    'light-heavy': { muLeft: 1, muRight: 4 },
    'heavy-light': { muLeft: 4, muRight: 1 },
    equal: { muLeft: 2, muRight: 2 },
  };
  Object.assign(state, scenarios[name]);
  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.classList.toggle('active', button.dataset.scenario === name);
  });
  updateControls();
  resetEngine();
}

function updateStateFromControls() {
  state.muLeft = Number(controls.muLeft.value);
  state.muRight = Number(controls.muRight.value);
  state.signalType = controls.signalType.value;
  state.shape = controls.shape.value;
  state.amplitude = Number(controls.amplitude.value);
  state.timeControl = Number(controls.timeControl.value);
  document.querySelectorAll('[data-scenario]').forEach((button) => button.classList.remove('active'));
  updateControls();
  resetEngine();
}

function configureEvents() {
  [controls.muLeft, controls.muRight, controls.signalType, controls.shape, controls.amplitude, controls.timeControl]
    .forEach((control) => control.addEventListener('input', updateStateFromControls));
  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => applyScenario(button.dataset.scenario));
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((modeButton) => {
        const active = modeButton.dataset.mode === state.mode;
        modeButton.classList.toggle('active', active);
        modeButton.setAttribute('aria-pressed', String(active));
      });
      resetEngine();
    });
  });
  controls.play.addEventListener('click', () => {
    state.playing = !state.playing;
    controls.play.textContent = state.playing ? '暫停' : '播放';
  });
  controls.reset.addEventListener('click', resetEngine);
  controls.slow.addEventListener('click', () => {
    state.slow = !state.slow;
    controls.slow.classList.toggle('active', state.slow);
    controls.slow.setAttribute('aria-pressed', String(state.slow));
  });
}

function drawBaseRopes() {
  const middle = canvas.height / 2;
  const junctionX = canvas.width / 2;
  context.lineWidth = 9;
  context.lineCap = 'round';
  context.strokeStyle = '#6cb5ee';
  context.beginPath(); context.moveTo(38, middle); context.lineTo(junctionX, middle); context.stroke();
  context.strokeStyle = '#f0a65d';
  context.beginPath(); context.moveTo(junctionX, middle); context.lineTo(canvas.width - 38, middle); context.stroke();
  context.setLineDash([5, 5]); context.lineWidth = 1.4; context.strokeStyle = 'rgba(255,255,255,.86)';
  context.beginPath(); context.moveTo(38, middle); context.lineTo(junctionX, middle); context.stroke();
  context.beginPath(); context.moveTo(junctionX, middle); context.lineTo(canvas.width - 38, middle); context.stroke();
  context.setLineDash([]);
  context.strokeStyle = '#455b76'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(junctionX, 44); context.lineTo(junctionX, canvas.height - 44); context.stroke();
  context.fillStyle = '#455b76'; context.font = '700 13px Arial'; context.textAlign = 'center';
  context.fillText('交界', junctionX, 31);
  context.fillStyle = '#4f89c4'; context.fillText(`μ₁ = ${state.muLeft.toFixed(2)}`, junctionX / 2, canvas.height - 24);
  context.fillStyle = '#bd6d1d'; context.fillText(`μ₂ = ${state.muRight.toFixed(2)}`, (junctionX + canvas.width) / 2, canvas.height - 24);
}

function strokeWave(points, color, label, direction, dashed = false) {
  context.save();
  context.strokeStyle = color; context.lineWidth = 3.8; context.lineJoin = 'round';
  if (dashed) context.setLineDash([8, 6]);
  context.beginPath();
  points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.stroke();
  context.setLineDash([]);
  const arrowX = direction === 'right' ? points.at(-1)[0] : points[0][0];
  const arrowY = direction === 'right' ? points.at(-1)[1] : points[0][1];
  context.fillStyle = color; context.font = '800 13px Arial'; context.textAlign = 'center';
  context.fillText(`${label} ${direction === 'right' ? '→' : '←'}`, arrowX, arrowY - 18);
  context.restore();
}

function conceptValue(kind, localDistance, waveSpeed, travelTime) {
  if (state.signalType === 'pulse') {
    return state.amplitude * pulseSample(state.shape, localDistance - waveSpeed * travelTime, state.timeControl);
  }
  const frequency = state.timeControl;
  return state.amplitude * sampleShape(state.shape, 2 * Math.PI * frequency * (travelTime - localDistance / waveSpeed));
}

function renderConcept() {
  const c = coefficients();
  const middle = canvas.height / 2;
  const junctionX = canvas.width / 2;
  const scale = 112;
  const startPosition = length * 0.26;
  const hitTime = (length / 2 - startPosition) / c.vLeft;
  const pointsFor = (side, sample) => {
    const points = [];
    for (let pixel = 42; pixel < canvas.width - 42; pixel += 4) {
      if ((side === 'left' && pixel > junctionX) || (side === 'right' && pixel < junctionX)) continue;
      points.push([pixel, middle - scale * sample(pixel)]);
    }
    return points;
  };
  const incident = pointsFor('left', (pixel) => {
    const position = (pixel / junctionX) * (length / 2);
    return state.signalType === 'pulse'
      ? pulseAt(position, startPosition + c.vLeft * state.elapsed)
      : conceptValue(state.shape, length / 2 - position, c.vLeft, state.elapsed + hitTime);
  });
  strokeWave(incident, '#277be8', '入射', 'right');
  if (state.elapsed >= hitTime) {
    const reflected = pointsFor('left', (pixel) => {
      const fromJunction = length / 2 - (pixel / junctionX) * (length / 2);
      return c.amplitudeReflection * conceptValue(state.shape, fromJunction, c.vLeft, state.elapsed - hitTime);
    });
    const transmitted = pointsFor('right', (pixel) => {
      const fromJunction = ((pixel - junctionX) / junctionX) * (length / 2);
      return c.amplitudeTransmission * conceptValue(state.shape, fromJunction, c.vRight, state.elapsed - hitTime);
    });
    strokeWave(reflected, '#7959d8', '反射', 'left', true);
    strokeWave(transmitted, '#e98628', '透射', 'right', true);
  }
}

function renderNumeric() {
  const middle = canvas.height / 2;
  const scale = 118;
  const points = Array.from(state.engine.y, (value, index) => {
    const x = 38 + (index / (state.engine.y.length - 1)) * (canvas.width - 76);
    return [x, middle - value * scale];
  });
  context.strokeStyle = '#1b679f'; context.lineWidth = 4; context.lineJoin = 'round';
  context.beginPath();
  points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.stroke();
  context.fillStyle = '#1b679f'; context.font = '800 13px Arial'; context.textAlign = 'left';
  context.fillText('整條繩的即時位移', 43, 62);
}

function advance(delta) {
  if (!state.playing) return;
  const speed = state.slow ? 0.25 : 1;
  const c = coefficients();
  const target = delta * speed;
  let remaining = target;
  while (remaining > 0) {
    const step = Math.min(remaining, state.engine.dt);
    if (state.mode === 'numeric') {
      if (state.signalType === 'continuous') {
        state.engine.y[1] = state.amplitude * sampleShape(state.shape, 2 * Math.PI * state.timeControl * state.elapsed);
      }
      stepStringState(state.engine, tension);
    }
    state.elapsed += step;
    remaining -= step;
  }
  if (state.signalType === 'pulse' && state.elapsed > 2.8) resetEngine();
  if (state.signalType === 'continuous' && state.elapsed > 12) state.elapsed = 0;
  if (c.energyReflection < 1e-9) return;
}

function renderFrame(timestamp) {
  const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.032);
  lastTimestamp = timestamp;
  advance(delta);
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawBaseRopes();
  if (state.mode === 'numeric') renderNumeric();
  else renderConcept();
  requestAnimationFrame(renderFrame);
}

readSettingsFromUrl();
updateControls();
resetEngine();
configureEvents();
requestAnimationFrame(renderFrame);
