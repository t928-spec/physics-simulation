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
  assert.match(home, /11 個主題/);
});

test('暫停時取消動畫迴圈，控制操作仍可直接重繪', () => {
  assert.match(html, /cancelAnimationFrame\(state\.frameRequest\)/);
  assert.match(html, /if \(state\.playing\) state\.frameRequest = requestAnimationFrame\(animate\);/);
  assert.match(html, /showArrivals\.addEventListener\('change', render\)/);
});

test('波場 Canvas 使用相同的水平與垂直物理比例', () => {
  assert.match(html, /id="fieldCanvas" width="720" height="540"/);
  assert.match(html, /buffer\.height = 180/);
});

test('觀察點路徑以與抵達相位一致的正弦波呈現', () => {
  assert.match(html, /function drawPathWave\(start, end, wavelength, endpointPhase, color\)/);
  assert.match(html, /Math\.sin\(endpointPhase - distanceFromEnd \* TAU \/ wavelength\)/);
  assert.match(html, /drawPathWave\(sources\[0\], point, settings\.wavelength, observation\.wavePhase1, '#66b5ff'\)/);
  assert.match(html, /drawPathWave\(sources\[1\], point, settings\.wavelength, observation\.wavePhase2, '#ff8277'\)/);
});
