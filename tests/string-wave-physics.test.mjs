import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBoundary,
  createStringState,
  stepStringState,
  pulseSample,
  normalizePlaybackSpeed,
  sanitizeDensities,
  sampleShape,
} from '../string-wave-physics.js';

test('light to heavy has inverted reflection and conserved energy', () => {
  const result = calculateBoundary(1, 4, 100);

  assert.ok(result.vLeft > result.vRight);
  assert.ok(result.amplitudeReflection < 0);
  assert.ok(Math.abs(result.energyReflection + result.energyTransmission - 1) < 1e-12);
});

test('heavy to light has non-inverted reflection', () => {
  assert.ok(calculateBoundary(4, 1, 100).amplitudeReflection > 0);
});

test('identical strings transmit all energy', () => {
  const result = calculateBoundary(2, 2, 100);

  assert.equal(result.energyReflection, 0);
  assert.equal(result.energyTransmission, 1);
});

test('wave samples are bounded and pulses vanish outside their width', () => {
  for (const kind of ['sine', 'triangle']) {
    assert.ok(Math.abs(sampleShape(kind, 1.2)) <= 1);
    assert.ok(Math.abs(pulseSample(kind, 0, 1)) <= 1);
    assert.equal(pulseSample(kind, 1.01, 1), 0);
  }
});

test('numerical string remains finite after a CFL-safe step sequence', () => {
  const state = createStringState({
    muLeft: 1,
    muRight: 4,
    tension: 100,
    pointCount: 160,
    length: 16,
  });

  assert.ok(state.dt <= state.dx / Math.sqrt(100));
  state.y[25] = 1;
  for (let index = 0; index < 120; index += 1) stepStringState(state, 100);
  assert.ok([...state.y].every(Number.isFinite));
});

test('numerical string has absorbing layers at both ends', () => {
  const state = createStringState({
    muLeft: 1, muRight: 4, tension: 100, pointCount: 160, length: 16,
  });

  assert.equal(state.absorption[0], 0);
  assert.ok(state.absorption[12] < 1);
  assert.equal(state.absorption[80], 1);
});

test('invalid derivation densities fall back to the light-to-heavy example', () => {
  assert.deepEqual(sanitizeDensities(-1, Number.NaN), { muLeft: 1, muRight: 4 });
  assert.deepEqual(sanitizeDensities(2.5, 3.5), { muLeft: 2.5, muRight: 3.5 });
});

test('only supported playback speeds are accepted', () => {
  assert.equal(normalizePlaybackSpeed(0.25), 0.25);
  assert.equal(normalizePlaybackSpeed(0.5), 0.5);
  assert.equal(normalizePlaybackSpeed(1), 1);
  assert.equal(normalizePlaybackSpeed(3), 0.25);
});
