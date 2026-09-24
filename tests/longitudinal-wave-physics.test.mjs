import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../longitudinal-wave-physics.js';
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

test('density guides align with the longitudinal wave compression and rarefaction extrema', () => {
  const { compression, rarefaction } = densityMarkers(720, 0);

  assert.deepEqual(compression.slice(0, 3), [120, 360, 600]);
  assert.deepEqual(rarefaction.slice(0, 4), [0, 240, 480, 720]);
});

test('particle field points use stable scattered positions instead of diagonal lattice rows', () => {
  assert.equal(typeof physics.particleFieldPoint, 'function');

  const points = Array.from(
    { length: 5 },
    (_, index) => physics.particleFieldPoint(index, 874, 38, 225),
  );
  const offsets = points.slice(1).map((point, index) => ({
    x: point.equilibrium - points[index].equilibrium,
    y: point.y - points[index].y,
  }));

  for (const point of points) {
    assert.ok(point.equilibrium >= 0 && point.equilibrium <= 874);
    assert.ok(point.y >= 116 && point.y <= 225);
  }
  assert.notDeepEqual(offsets[0], offsets[1]);
});
