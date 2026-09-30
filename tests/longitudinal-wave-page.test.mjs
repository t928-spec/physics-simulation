import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../longitudinal-wave-displacement-pressure.html', import.meta.url), 'utf8');

test('page has canvas, all original controls, dialog and module controller', () => {
  for (const id of [
    'longitudinalWaveCanvas', 'speedControl', 'playButton', 'resetButton',
    'waveformToggle', 'displacementToggle', 'pressureToggle', 'probeToggle',
    'guidesToggle', 'helpButton', 'helpDialog', 'closeHelpButton',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }

  assert.match(page, /<canvas[^>]*aria-label="縱波中粒子位移與壓力的同步動畫"/);
  assert.match(page, /<script type="module" src="\.\/longitudinal-wave-displacement-pressure\.js"><\/script>/);
  assert.match(page, /此瀏覽器無法繪製 Canvas/);
});

test('homepage advertises the longitudinal wave simulation', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(home, /href="\.\/longitudinal-wave-displacement-pressure\.html"/);
  assert.match(home, /縱波：位移、密疏與壓力/);
  assert.match(home, /十一個適合課堂投影/);
  assert.match(home, /11 個主題/);
});

test('renderer uses shared modules and supports dragging and help dialog', () => {
  const controller = readFileSync(
    new URL('../longitudinal-wave-displacement-pressure.js', import.meta.url),
    'utf8',
  );

  assert.match(controller, /from '\.\/longitudinal-wave-physics\.js'/);
  assert.match(controller, /from '\.\/longitudinal-wave-state\.js'/);
  assert.match(controller, /requestAnimationFrame/);
  assert.match(controller, /pointerdown/);
  assert.match(controller, /pointermove/);
  assert.match(controller, /showModal\(\)/);
});

test('renderer draws red horizontal and vertical displacement range brackets', () => {
  const controller = readFileSync(
    new URL('../longitudinal-wave-displacement-pressure.js', import.meta.url),
    'utf8',
  );

  assert.match(controller, /function drawRangeBracket/);
  assert.match(controller, /DEFAULT_WAVE\.amplitude/);
  assert.match(controller, /'horizontal'/);
  assert.match(controller, /'vertical'/);
  assert.match(controller, /stateToDraw\.layers\.probe/);
});
