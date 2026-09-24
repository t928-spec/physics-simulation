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
    rarefaction: markerSeries(safeWidth, wave.wavelength / 4 + phaseShift, wave.wavelength),
  };
}
