export const DEFAULT_WAVE_SETTINGS = Object.freeze({
  wavelength: 8,
  sourceDistance: 16,
  sourcePhaseDegrees: 0,
  amplitude: 1,
});

const TAU = 2 * Math.PI;

export function normalizeWaveSettings(settings = {}) {
  const valid = (value, minimum, maximum, fallback) => (
    Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback
  );

  return {
    wavelength: valid(settings.wavelength, 4, 16, DEFAULT_WAVE_SETTINGS.wavelength),
    sourceDistance: valid(settings.sourceDistance, 6, 34, DEFAULT_WAVE_SETTINGS.sourceDistance),
    sourcePhaseDegrees: valid(
      settings.sourcePhaseDegrees, 0, 360, DEFAULT_WAVE_SETTINGS.sourcePhaseDegrees,
    ),
    amplitude: valid(settings.amplitude, 0.1, 2, DEFAULT_WAVE_SETTINGS.amplitude),
  };
}

export function calculatePhaseDifference(pathDifference, wavelength, sourcePhaseDegrees) {
  return TAU * pathDifference / wavelength + sourcePhaseDegrees * Math.PI / 180;
}

export function classifyInterference(totalPhase) {
  const alignment = Math.cos(totalPhase);
  if (alignment >= 0.9) return '相長干涉';
  if (alignment <= -0.9) return '相消干涉';
  return '部分干涉';
}

export function calculateObservation({ x, y, time = 0, settings = {} }) {
  const wave = normalizeWaveSettings(settings);
  const r1 = Math.hypot(x, y + wave.sourceDistance / 2);
  const r2 = Math.hypot(x, y - wave.sourceDistance / 2);
  const pathDifference = r2 - r1;
  const totalPhase = calculatePhaseDifference(
    pathDifference,
    wave.wavelength,
    wave.sourcePhaseDegrees,
  );
  const phase1 = TAU * r1 / wave.wavelength - time;
  const phase2 = TAU * r2 / wave.wavelength - time
    + wave.sourcePhaseDegrees * Math.PI / 180;
  const displacement1 = wave.amplitude * Math.sin(phase1);
  const displacement2 = wave.amplitude * Math.sin(phase2);

  return {
    r1,
    r2,
    pathDifference,
    normalizedPathDifference: pathDifference / wave.wavelength,
    totalPhase,
    relativeIntensity: (1 + Math.cos(totalPhase)) / 2,
    label: classifyInterference(totalPhase),
    displacement1,
    displacement2,
    displacement: displacement1 + displacement2,
  };
}

export function sampleInterferenceField(input) {
  return calculateObservation(input).displacement / 2;
}
