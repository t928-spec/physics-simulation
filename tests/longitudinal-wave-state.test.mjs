import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATE,
  advanceState,
  resetState,
  setProbe,
  toggleLayer,
  togglePlaying,
} from '../longitudinal-wave-state.js';

test('phase advances only while playback is active', () => {
  assert.equal(advanceState(DEFAULT_STATE, 0.5).phase, 0.5);
  assert.equal(advanceState({ ...DEFAULT_STATE, playing: false }, 0.5).phase, 0);
});

test('probe position clamps to the rendered width', () => {
  assert.equal(setProbe(DEFAULT_STATE, -1, 600).probeX, 0);
  assert.equal(setProbe(DEFAULT_STATE, 601, 600).probeX, 600);
});

test('controls preserve unrelated state', () => {
  assert.equal(toggleLayer(DEFAULT_STATE, 'pressure', false).layers.pressure, false);
  assert.equal(togglePlaying(DEFAULT_STATE).playing, false);
  assert.deepEqual(resetState(), DEFAULT_STATE);
});
