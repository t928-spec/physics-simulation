import test from 'node:test';
import assert from 'node:assert/strict';
import { MOLECULES, getPresetModeIds, summarizeModes, getAtomPositions } from '../molecular-degrees-of-freedom.js';
import vm from 'node:vm';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);

for (const internalMode of ['symmetric-stretch', 'antisymmetric-stretch', 'bend-degenerate']) {
  test(`${internalMode} leaves the CO2 mass center stationary`, () => {
    for (const time of [0, 0.7, 2.1, 4.2]) {
      const atoms = getAtomPositions('linear-triatomic', [internalMode], time);
      for (const axis of ['x', 'y', 'z']) {
        near((16 * atoms[0][axis] + 12 * atoms[1][axis] + 16 * atoms[2][axis]) / 44, 0, `${internalMode} center ${axis}`);
      }
      if (internalMode !== 'symmetric-stretch') {
        const axis = internalMode === 'antisymmetric-stretch' ? 'x' : 'y';
        const oxygenDisplacement = atoms[0][axis] - (axis === 'x' ? -1.25 : 0);
        assert.ok(oxygenDisplacement * atoms[1][axis] < 0, 'carbon and oxygens move in opposite directions');
      }
    }
  });
}

test('laboratory translation is independent of rigid rotation', () => {
  for (const moleculeId of ['diatomic', 'linear-triatomic']) {
    for (const translation of ['tx', 'ty', 'tz']) {
      const time = 0.9;
      const rotated = getAtomPositions(moleculeId, ['ry', 'rz'], time);
      const combined = getAtomPositions(moleculeId, [translation, 'ry', 'rz'], time);
      combined.forEach((atom, index) => {
        for (const axis of ['x', 'y', 'z']) near(atom[axis] - rotated[index][axis], translation === `t${axis}` ? .22 * Math.sin(time + .74) : 0, `${translation} along ${axis}`);
      });
    }
  }
});

test('internal vibrations rotate with the molecular frame', () => {
  for (const [moleculeId, vibration] of [['diatomic', 'stretch'], ['linear-triatomic', 'symmetric-stretch'], ['linear-triatomic', 'antisymmetric-stretch'], ['linear-triatomic', 'bend-degenerate']]) {
    const time = .8;
    const angle = .18 * Math.sin(time + .74);
    const c = Math.cos(angle); const s = Math.sin(angle);
    const internal = getAtomPositions(moleculeId, [vibration], time);
    const rotated = getAtomPositions(moleculeId, [vibration, 'ry', 'rz'], time);
    internal.forEach(({ x, y, z }, index) => {
      const rotatedX = x * c + z * s;
      near(rotated[index].x, rotatedX * c - y * s, `${vibration} rotated x`);
      near(rotated[index].y, rotatedX * s + y * c, `${vibration} rotated y`);
      near(rotated[index].z, -x * s + z * c, `${vibration} rotated z`);
    });
  }
});

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
  assert.doesNotMatch(page, /type=["']module["']/);
  assert.match(page, /requestAnimationFrame/);
});

test('shared core is a file-compatible classic script with the same tested API', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  assert.match(page, /<script src=["']\.\/molecular-degrees-of-freedom\.js["']><\/script>/);
  assert.doesNotMatch(page, /\bimport\s+.*\bfrom\b/);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.js'), 'utf8'), context);
  const local = context.MolecularDegrees;
  assert.ok(local, 'classic browser global is available without a module loader');
  assert.equal(local.summarizeModes('diatomic', local.getPresetModeIds('diatomic', 'vibration')).equipartitionF, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(local.getAtomPositions('linear-triatomic', ['antisymmetric-stretch'], .7))), getAtomPositions('linear-triatomic', ['antisymmetric-stretch'], .7));
});

function drawingContext() {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  const calls = [];
  const ctx = new Proxy({}, { get: (target, property) => target[property] ?? ((...args) => {
    calls.push([property, ...args]);
    if (property === 'createRadialGradient') return { addColorStop() {} };
  }) });
  const context = vm.createContext({ ctx, MOLECULES, summarizeModes, canvas: { width: 920, height: 560 }, moleculeId: 'monoatomic', enabledModeIds: ['tz'], arrows: [] });
  vm.runInContext(page.slice(page.indexOf('    const kindName ='), page.indexOf('    function simulationTime(')), context);
  return { context, calls };
}

test('legend starts a fresh canvas path after atom or arrow drawing', () => {
  const { context, calls } = drawingContext();
  vm.runInContext("ctx.beginPath(); ctx.arc(20, 20, 10, 0, 6); drawLegend(summarizeModes('monoatomic', ['tz']));", context);
  const rectangle = calls.findIndex(([method]) => method === 'roundRect');
  assert.equal(calls[rectangle - 1][0], 'beginPath');
});

test('z axis and translation marker follow the projected positive z direction', () => {
  const { context } = drawingContext();
  vm.runInContext("drawArrow = (from, to, color, label) => arrows.push({ from, to, label }); drawCanvas([{ x: 0, y: 0, z: 0, element: 'Ne' }]);", context);
  const delta = vm.runInContext('({ x: project({x:0,y:0,z:1}).x - project({x:0,y:0,z:0}).x, y: project({x:0,y:0,z:1}).y - project({x:0,y:0,z:0}).y })', context);
  for (const label of ['z', '沿 z']) {
    const { from, to } = context.arrows.find((arrow) => arrow.label === label);
    const dx = to.x - from.x; const dy = to.y - from.y;
    near(dx * delta.y - dy * delta.x, 0, `${label} is parallel to projection`);
    assert.ok(dx * delta.x + dy * delta.y > 0, `${label} points toward positive z`);
  }
});

test('page retains checkbox focus, preserves paused phase, and labels each vibration marker', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  assert.match(page, /checkbox\.dataset\.modeId = mode\.id/);
  assert.match(page, /modeList\.querySelector\(`\[data-mode-id="\$\{modeIdToFocus\}"\]`\)\?\.focus\(\)/);
  assert.match(page, /let pausedAtSeconds = 0/);
  assert.match(page, /function simulationTime\(nowMs = performance\.now\(\)\)/);
  assert.match(page, /return pausedAtSeconds \+ \(isPlaying \? \(nowMs - startMs\) \/ 1000 : 0\)/);
  assert.match(page, /pausedAtSeconds = simulationTime\(\)/);
  for (const label of ['雙原子鍵長伸縮', '對稱伸縮', '非對稱伸縮', '彎曲：鍵角改變（y/z）']) assert.ok(page.includes(label));
  assert.match(page, /const leftDirection = isAntisymmetric \? 48 : -48/);
  assert.match(page, /const rightDirection = 48/);
  assert.doesNotMatch(page, /hasVibration && projected\.length > 1\) drawSpring/);
  assert.match(page, /\$\{kindName\(mode\.kind\)\}自由度。/);
  assert.doesNotMatch(page, /\$\{mode\.kind\} 自由度。/);
});

test('linear triatomic stretch markers use separate arrow and label lanes', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  assert.match(page, /const markerLane = isAntisymmetric \? 108 : 52/);
  assert.match(page, /left\.y \+ markerLane/);
  assert.match(page, /right\.y \+ markerLane/);
  assert.match(page, /Math\.max\(left\.y, center\.y, right\.y\) \+ markerLane \+ 31/);
});

test('home page and README link to the molecular degrees simulation', () => {
  const home = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(home, /href=["']\.\/molecular-degrees-of-freedom\.html["']/);
  assert.match(home, /分子自由度：把運動拆開看/);
  assert.match(readme, /molecular-degrees-of-freedom\.html/);
});
