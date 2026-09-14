import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateObservation,
  calculatePhaseDifference,
  classifyInterference,
  normalizeWaveSettings,
  sampleInterferenceField,
} from '../water-wave-physics.js';

test('同相且程差為零時為相長干涉', () => {
  assert.equal(classifyInterference(calculatePhaseDifference(0, 8, 0)), '相長干涉');
});

test('同相且程差為半波長時為相消干涉', () => {
  assert.equal(classifyInterference(calculatePhaseDifference(4, 8, 0)), '相消干涉');
});

test('反相且程差為零時為相消干涉', () => {
  assert.equal(classifyInterference(calculatePhaseDifference(0, 8, 180)), '相消干涉');
});

test('手動相位差會併入傳播相位差', () => {
  assert.ok(Math.abs(calculatePhaseDifference(2, 8, 90) - Math.PI) < 1e-12);
});

test('觀察點回傳有限程差與強度', () => {
  const value = calculateObservation({
    x: 30,
    y: 0,
    time: 0.4,
    settings: { wavelength: 8, sourceDistance: 16, sourcePhaseDegrees: 0 },
  });
  assert.ok(Number.isFinite(value.pathDifference));
  assert.ok(value.relativeIntensity >= 0 && value.relativeIntensity <= 1);
});

test('不安全設定回復安全預設', () => {
  assert.deepEqual(normalizeWaveSettings({
    wavelength: Number.NaN,
    sourceDistance: -1,
    sourcePhaseDegrees: Infinity,
  }), { wavelength: 8, sourceDistance: 16, sourcePhaseDegrees: 0, amplitude: 1 });
});

test('同相波場在兩源中線左右具有交換對稱性', () => {
  const settings = { wavelength: 8, sourceDistance: 16, sourcePhaseDegrees: 0 };
  assert.ok(Math.abs(
    sampleInterferenceField({ x: -12, y: 5, time: 1, settings })
      - sampleInterferenceField({ x: 12, y: 5, time: 1, settings }),
  ) < 1e-12);
});
