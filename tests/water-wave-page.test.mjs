import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../water-wave-interference.html', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('水波頁面提供所有必要控制與 Canvas', () => {
  for (const id of [
    'playButton', 'wavelength', 'sourceDistance', 'inPhase', 'antiPhase',
    'sourcePhase', 'showArrivals', 'fieldCanvas', 'traceCanvas',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /water-wave-physics\.js/);
  assert.match(html, /可點擊或拖曳設定觀察點 P/);
});

test('首頁連結水波干涉模擬並更新主題數', () => {
  assert.match(home, /href=["']\.\/water-wave-interference\.html["']/);
  assert.match(home, /水波干涉：波程差與相位差/);
  assert.match(home, /9 個主題/);
});
