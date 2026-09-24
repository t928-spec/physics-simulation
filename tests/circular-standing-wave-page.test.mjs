import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../circular-standing-wave.html', import.meta.url), 'utf8');

test('circular-wave page has canvas, accessible controls, and module controller', () => {
  for (const id of [
    'modeControl', 'playButton', 'speedControl', 'resetButton', 'membraneCanvas', 'modeSummary',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /<canvas[^>]*aria-label="圓形振膜的駐波動畫"/);
  assert.match(page, /<script type="module" src="\.\/circular-standing-wave\.js"><\/script>/);
  assert.match(page, /此瀏覽器無法繪製 Canvas/);
});

test('homepage advertises and links all newly merged simulations', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(home, /十一個適合課堂投影/);
  assert.match(home, /11 個主題/);
  assert.match(home, /href="\.\/circular-standing-wave\.html"/);
  assert.match(home, /圓形駐波：看見節線與腹部/);
  assert.match(home, /href="\.\/molecular-degrees-of-freedom\.html"/);
  assert.match(home, /分子自由度：把運動拆開看/);
});
