export const DEFAULT_WAVE = Object.freeze({
  amplitude: 26,
  wavelength: 240,
  pressureAmplitude: 26,
});

const TAU = Math.PI * 2;

export function normalizeWaveConfig(config = {}) {
  const candidate = {
    amplitude: Number(config.amplitude),
    wavelength: Number(config.wavelength),
    pressureAmplitude: Number(config.pressureAmplitude),
  };

  return Object.values(candidate).every((value) => Number.isFinite(value) && value > 0)
    ? candidate
    : DEFAULT_WAVE;
}

export function phaseAt(x, time, config = DEFAULT_WAVE) {
  const wave = normalizeWaveConfig(config);
  const safeX = Number.isFinite(Number(x)) ? Number(x) : 0;
  const safeTime = Number.isFinite(Number(time)) ? Number(time) : 0;

  return TAU * safeX / wave.wavelength - safeTime;
}

export function displacementAt(x, time, config = DEFAULT_WAVE) {
  const wave = normalizeWaveConfig(config);
  return wave.amplitude * Math.sin(phaseAt(x, time, wave));
}

export function pressureAt(x, time, config = DEFAULT_WAVE) {
  const wave = normalizeWaveConfig(config);
  return -wave.pressureAmplitude * Math.cos(phaseAt(x, time, wave));
}

export function particlePosition(x, time, config = DEFAULT_WAVE) {
  return Number(x) + displacementAt(x, time, config);
}

export function sampleProbe(x, time, config = DEFAULT_WAVE) {
  return {
    equilibriumX: Number(x),
    particleX: particlePosition(x, time, config),
    displacement: displacementAt(x, time, config),
    pressure: pressureAt(x, time, config),
  };
}

function scatteredFraction(index, seed) {
  let value = (Math.imul(index + 1, 0x9e3779b1) + Math.imul(seed, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

export function particleFieldPoint(index, width, top, bottom) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const safeWidth = Math.max(1, Number(width) || 1);
  const particleTop = Number(top) + 78;
  const particleHeight = Math.max(1, Number(bottom) - Number(top) - 90);

  return {
    equilibrium: scatteredFraction(safeIndex, 1) * safeWidth,
    y: particleTop + scatteredFraction(safeIndex, 2) * particleHeight,
  };
}

function markerSeries(width, start, wavelength) {
  const markers = [];
  const first = start - Math.ceil(start / wavelength) * wavelength;

  for (let x = first; x <= width; x += wavelength) {
    if (x >= 0) markers.push(x);
  }

  return markers;
}

export function densityMarkers(width, time, config = DEFAULT_WAVE) {
  const wave = normalizeWaveConfig(config);
  const safeWidth = Math.max(0, Number(width) || 0);
  const phaseShift = ((Number(time) || 0) % TAU) * wave.wavelength / TAU;

  return {
    compression: markerSeries(safeWidth, wave.wavelength / 2 + phaseShift, wave.wavelength),
    rarefaction: markerSeries(safeWidth, phaseShift, wave.wavelength),
  };
}
