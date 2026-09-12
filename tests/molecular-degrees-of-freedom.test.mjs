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

test('linear triatomic antisymmetric stretch changes adjacent bond lengths in opposite directions', () => {
  const positions = getAtomPositions('linear-triatomic', ['antisymmetric-stretch'], 0.7);
  const leftBond = Math.hypot(positions[1].x - positions[0].x, positions[1].y - positions[0].y, positions[1].z - positions[0].z);
  const rightBond = Math.hypot(positions[2].x - positions[1].x, positions[2].y - positions[1].y, positions[2].z - positions[1].z);
  assert.ok((leftBond - 1.25) * (rightBond - 1.25) < 0);
});

test('linear triatomic degenerate bend produces a non-collinear bend in both perpendicular directions', () => {
  const positions = getAtomPositions('linear-triatomic', ['bend-degenerate'], 0.6);
  const left = positions[0];
  const center = positions[1];
  const right = positions[2];
  const cross = [
    (center.y - left.y) * (right.z - center.z) - (center.z - left.z) * (right.y - center.y),
    (center.z - left.z) * (right.x - center.x) - (center.x - left.x) * (right.z - center.z),
    (center.x - left.x) * (right.y - center.y) - (center.y - left.y) * (right.x - center.x),
  ];
  assert.ok(Math.hypot(...cross) > 1e-8);
  assert.ok(Math.abs(left.y - center.y) > 1e-8);
  assert.ok(Math.abs(left.z - center.z) > 1e-8);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('page has required accessible interactive controls', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  for (const id of ['moleculeSelect', 'presetTranslation', 'presetRigid', 'presetVibration', 'playPause', 'resetSimulation', 'modeList', 'degreesReadout', 'moleculeCanvas']) assert.match(page, new RegExp(`id=["']${id}["']`));
  assert.match(page, /type=["']module["']/);
  assert.match(page, /requestAnimationFrame/);
});
