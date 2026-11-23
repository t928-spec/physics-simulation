import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createCamera, drawScene } from '../optics/scene.js';

test('the simulation catalogue includes a dedicated optics lab card', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(home, /<a class="card" href="\.\/optics\/">[\s\S]*?<h3>光學實驗室<\/h3>/);
  assert.match(home, /src="\.\/assets\/optics-lab-preview\.png"/);
});

test('projected pins can be picked on the paper after camera rotation', () => {
  for (const [yaw, pitch] of [[-.28, .67], [.8, .36], [-1.4, 1.2]]) {
    const camera = createCamera(yaw, pitch);
    const point = [-109, 48, 0];
    const [x, y] = camera.project(point);
    const picked = camera.floor(x, y);
    assert.ok(Math.hypot(point[0] - picked[0], point[1] - picked[1]) < 1e-8);
    assert.ok(camera.project([...point.slice(0, 2), 30])[1] < y);
  }
});

test('the entire interference pattern is painted over the screen background at either yaw', () => {
  for (const yaw of [-.8, .8]) {
    const fills = [];
    const noop = () => {};
    const context = {
      save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
      closePath: noop, stroke: noop, setLineDash: noop, strokeText: noop, fillText: noop,
      fill() { fills.push(this.fillStyle); }
    };
    drawScene(context, createCamera(yaw), 'slit', {
      mounted: true, laser: true, color: 'red', plate: 'double', L: 1.5, marks: []
    }, { interval: .39 });
    const background = fills.indexOf('#172729');
    const stripe = color => color.startsWith('rgba(244,91,66,');
    assert.ok(background >= 0);
    assert.equal(fills.filter(stripe).length, 116);
    assert.equal(fills.slice(background + 1).filter(stripe).length, 116);
  }
});
