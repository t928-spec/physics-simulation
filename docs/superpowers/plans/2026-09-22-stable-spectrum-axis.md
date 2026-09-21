# Stable Spectrum Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each anonymous-sound spectrum comparable by drawing a fixed 0–1800 Hz axis and allowing a one-second averaged spectrum to be locked.

**Architecture:** Keep numerical spectrum operations in `air-column-spectrum-physics.js`, where they can be tested independently. Let `air-column-spectrum.js` manage audio-frame collection and display state per card; it supplies a stable set of byte magnitudes to the canvas renderer. The HTML owns the accessible control for each card.

**Tech Stack:** Browser Web Audio API, Canvas 2D, ES modules, Node built-in test runner.

## Global Constraints

- The visible horizontal frequency range is exactly 0–1800 Hz with labels every 300 Hz.
- Averaging collects approximately one second of active playback; pausing preserves partial collection without presenting it as a completed average.
- The initial listening stage must not reveal instrument identities or boundary models.
- No dependencies are added.

---

### Task 1: Test and add reusable spectrum constants and averaging

**Files:**
- Modify: `air-column-spectrum-physics.js`
- Modify: `tests/air-column-spectrum-physics.test.mjs`

**Interfaces:**
- Produces: `SPECTRUM_AXIS_MAX_HZ` with value `1800`.
- Produces: `SPECTRUM_AXIS_TICK_HZ` with value `300`.
- Produces: `averageSpectrumFrames(frames: number[][]): number[]`, returning a bin-by-bin arithmetic mean rounded to the nearest integer; returns `[]` for no frames.

- [ ] **Step 1: Write the failing tests**

```js
test('spectrum display has a fixed teaching range and tick spacing', () => {
  assert.equal(SPECTRUM_AXIS_MAX_HZ, 1800);
  assert.equal(SPECTRUM_AXIS_TICK_HZ, 300);
});

test('averaging frames stabilises one spectrum per frequency bin', () => {
  assert.deepEqual(averageSpectrumFrames([[10, 20, 30], [20, 40, 50]]), [15, 30, 40]);
  assert.deepEqual(averageSpectrumFrames([]), []);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-physics.test.mjs`

Expected: FAIL because the three new exports do not yet exist.

- [ ] **Step 3: Implement the minimal numerical API**

```js
export const SPECTRUM_AXIS_MAX_HZ = 1800;
export const SPECTRUM_AXIS_TICK_HZ = 300;

export function averageSpectrumFrames(frames) {
  if (!frames.length) return [];
  return frames[0].map((_, index) => Math.round(
    frames.reduce((sum, frame) => sum + frame[index], 0) / frames.length,
  ));
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/air-column-spectrum-physics.test.mjs`

Expected: every test passes.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum-physics.js tests/air-column-spectrum-physics.test.mjs
git commit -m "feat: add stable spectrum averaging core"
```

### Task 2: Test and add axis labels plus per-card lock control

**Files:**
- Modify: `air-column-spectrum.html`
- Modify: `air-column-spectrum.js`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Consumes: `SPECTRUM_AXIS_MAX_HZ`, `SPECTRUM_AXIS_TICK_HZ`, and `averageSpectrumFrames()` from the physics module.
- Produces: one `.spectrum-lock` button per anonymous sample; `drawSpectrum(canvas, values, hertzPerBin)` renders only the fixed range, vertical 300-Hz gridlines, and labelled ticks.

- [ ] **Step 1: Write the failing page tests**

```js
test('each anonymous spectrum offers a stable one-second lock and fixed axis', () => {
  const page = readFileSync(join(projectRoot, 'air-column-spectrum.html'), 'utf8');
  assert.equal((page.match(/class="spectrum-lock"/g) || []).length, 3);
  assert.match(page, /鎖定 1 秒平均/);
  const script = readFileSync(join(projectRoot, 'air-column-spectrum.js'), 'utf8');
  assert.match(script, /SPECTRUM_AXIS_MAX_HZ/);
  assert.match(script, /SPECTRUM_AXIS_TICK_HZ/);
  assert.match(script, /averageSpectrumFrames/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because no `.spectrum-lock` controls or fixed-axis imports exist.

- [ ] **Step 3: Implement the minimal UI and playback state**

```js
// In each spectrum stage, place the control after the canvas.
<button class="spectrum-lock" type="button">鎖定 1 秒平均</button>

// In drawSpectrum, calculate the highest rendered bin from the shared 1800-Hz
// constant and draw x-axis gridlines/labels from 0 through 1800 at 300-Hz steps.
// Reserve a bottom margin so every label is readable.

// Per card: keep captureFrames, captureElapsedMs, lastCaptureTimestamp and
// lockState ('live', 'capturing', 'locked'). While capturing, append current
// analyser values on animation frames; after 1000 ms of active playback, call
// averageSpectrumFrames(captureFrames), freeze that result and relabel the
// control to '恢復即時頻譜'. On pause retain a partial capture and ask the user
// to continue playing; on restore, clear the capture and return to live data.
```

- [ ] **Step 4: Run focused and complete tests**

Run: `node --test tests/air-column-spectrum-page.test.mjs; node --test tests/*.test.mjs`

Expected: the focused page tests and the complete suite pass with zero failures.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum.html air-column-spectrum.js tests/air-column-spectrum-page.test.mjs
git commit -m "feat: add fixed spectrum axis and lock control"
```

