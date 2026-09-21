import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_STAGES,
  findProminentPeaks,
  estimateFundamentalHz,
  classifyPeakSpacing,
  nextRevealStage,
} from '../air-column-spectrum-physics.js';

test('peaks are local maxima above the relative threshold', () => {
  assert.deepEqual(findProminentPeaks([0, 4, 1, 8, 2, 3, 0], 0.4), [1, 3]);
});

test('fundamental uses shared harmonic spacing', () => {
  assert.equal(estimateFundamentalHz([220, 660, 1100]), 220);
  assert.equal(estimateFundamentalHz([262, 524, 786, 1048]), 262);
});

test('spacing description stays observational', () => {
  assert.equal(classifyPeakSpacing([220, 660, 1100], 220), '奇次倍數較突出');
  assert.equal(classifyPeakSpacing([262, 524, 786], 262), '整數倍規律明顯');
});

test('each card advances through five reveal stages', () => {
  assert.deepEqual(REVEAL_STAGES, ['listen', 'spectrum', 'models', 'answer', 'extension']);
  assert.equal(nextRevealStage('listen'), 'spectrum');
  assert.equal(nextRevealStage('extension'), 'extension');
});
