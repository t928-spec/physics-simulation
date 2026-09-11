import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, getModeById, modeSummary, normalizeSpeed, waveDisplacement,
} from '../circular-standing-wave-physics.js';

test('catalogue exposes the five agreed modes', () => {
  assert.deepEqual(MODES.map(({ id }) => id), [
    'base', 'diameter-2', 'diameter-3', 'circle-1', 'mixed-2-1',
  ]);
  assert.equal(getModeById('diameter-3').nodalDiameters, 3);
  assert.equal(getModeById('missing').id, 'base');
});

test('only approved speed values are accepted', () => {
  assert.equal(normalizeSpeed(0.5), 0.5);
  assert.equal(normalizeSpeed(1), 1);
  assert.equal(normalizeSpeed(1.5), 1.5);
  assert.equal(normalizeSpeed(2), 1);
});

test('the membrane edge and nodal lines remain at zero displacement', () => {
  assert.equal(waveDisplacement(getModeById('base'), 1, 0, 0), 0);
  assert.ok(Math.abs(waveDisplacement(getModeById('diameter-2'), 0.6, Math.PI / 4, 0)) < 1e-12);
  assert.ok(Math.abs(waveDisplacement(getModeById('circle-1'), 1 / 3, 0, 0)) < 1e-12);
});

test('a non-nodal point reverses its displacement after half a cycle', () => {
  const mode = getModeById('base');

  assert.ok(waveDisplacement(mode, 0.3, 0, 0) > 0);
  assert.ok(waveDisplacement(mode, 0.3, 0, Math.PI) < 0);
  assert.match(modeSummary(getModeById('mixed-2-1')), /2 條節徑/);
});
