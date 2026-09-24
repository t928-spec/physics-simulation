import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WAVE,
  densityMarkers,
  displacementAt,
  normalizeWaveConfig,
  particlePosition,
  pressureAt,
  sampleProbe,
} from '../longitudinal-wave-physics.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);

test('invalid wave settings use safe defaults', () => {
  assert.deepEqual(
    normalizeWaveConfig({ amplitude: -1, wavelength: 0, pressureAmplitude: NaN }),
    DEFAULT_WAVE,
  );
});

test('displacement and pressure are a quarter cycle out of phase', () => {
  near(displacementAt(0, 0), 0);
  near(pressureAt(0, 0), -DEFAULT_WAVE.pressureAmplitude);
  near(displacementAt(DEFAULT_WAVE.wavelength / 4, 0), DEFAULT_WAVE.amplitude);
  near(pressureAt(DEFAULT_WAVE.wavelength / 4, 0), 0);
});

test('probe reads the selected particle position and both graph values', () => {
  const probe = sampleProbe(60, Math.PI / 2);

  near(probe.particleX, particlePosition(60, Math.PI / 2));
  near(probe.displacement, displacementAt(60, Math.PI / 2));
  near(probe.pressure, pressureAt(60, Math.PI / 2));
});

test('density markers are finite and remain inside the viewport', () => {
  const { compression, rarefaction } = densityMarkers(720, 0);

  assert.ok(compression.length > 1);
  assert.ok(rarefaction.length > 1);
  for (const x of [...compression, ...rarefaction]) assert.ok(x >= 0 && x <= 720);
});
