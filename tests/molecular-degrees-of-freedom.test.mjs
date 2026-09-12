import test from 'node:test';
import assert from 'node:assert/strict';
import { MOLECULES, getPresetModeIds, summarizeModes, getAtomPositions } from '../molecular-degrees-of-freedom.js';

test('molecule definitions include the intended independent modes', () => {
  assert.deepEqual(Object.keys(MOLECULES), ['monoatomic', 'diatomic', 'linear-triatomic']);
  assert.equal(MOLECULES.monoatomic.modes.filter((mode) => mode.kind === 'translation').length, 3);
  assert.equal(MOLECULES.diatomic.modes.filter((mode) => mode.kind === 'rotation').length, 2);
  assert.equal(MOLECULES['linear-triatomic'].modes.some((mode) => mode.id === 'bend-degenerate'), true);
});

test('diatomic presets reproduce f = 5 and f = 7', () => {
  assert.equal(summarizeModes('diatomic', getPresetModeIds('diatomic', 'rigid')).equipartitionF, 5);
  const result = summarizeModes('diatomic', getPresetModeIds('diatomic', 'vibration'));
  assert.equal(result.visibleCount, 6);
  assert.equal(result.equipartitionF, 7);
});

test('linear triatomic rigid model has 3 translations and 2 rotations only', () => {
  assert.deepEqual(summarizeModes('linear-triatomic', getPresetModeIds('linear-triatomic', 'rigid')).parts, [
    { kind: 'translation', visible: 3, equipartition: 3 },
    { kind: 'rotation', visible: 2, equipartition: 2 },
  ]);
});

test('all preset coordinates are finite', () => {
  for (const id of Object.keys(MOLECULES)) {
    const positions = getAtomPositions(id, getPresetModeIds(id, 'vibration'), 1.25);
    assert.ok(positions.length >= 1);
    assert.ok(positions.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)));
  }
});
