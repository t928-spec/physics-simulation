import test from 'node:test';
import assert from 'node:assert/strict';
import { refractedAngle, pinDeviation, imageDistance, focalLength, wavelength, slitWidth, regression, summary } from '../optics/physics.js';

test('refraction uses the normal and a longer baseline limits angular deviation', () => {
  assert.ok(Math.abs(refractedAngle(60, Math.sqrt(3)) - 30) < 1e-10);
  assert.ok(pinDeviation(20, 1) > pinDeviation(60, 1));
});

test('lens model handles real and virtual images', () => {
  assert.equal(imageDistance(30, 15), 30);
  assert.equal(imageDistance(30, -15), -10);
  assert.equal(imageDistance(15, 15), Infinity);
  assert.equal(focalLength(30, -10), -15);
});

test('pattern measurement converts centimetres, metres, millimetres and nanometres', () => {
  assert.ok(Math.abs(wavelength(0.25, 2, 0.52) - 650) < 1e-10);
  assert.ok(Math.abs(slitWidth(650, 2, 1.3) - 0.1) < 1e-10);
});

test('regression and Type A uncertainty handle degenerate inputs', () => {
  assert.deepEqual(regression([[1, 3], [2, 5], [3, 7]]), { slope: 2, intercept: 1, r2: 1 });
  assert.equal(regression([[1, 3], [1, 5]]), null);
  assert.equal(regression([[1, 3], [2, 3]]).r2, null);
  assert.deepEqual(summary([2]), { mean: 2, uncertainty: null });
  assert.ok(Math.abs(summary([1, 3]).uncertainty - 1) < 1e-10);
});
