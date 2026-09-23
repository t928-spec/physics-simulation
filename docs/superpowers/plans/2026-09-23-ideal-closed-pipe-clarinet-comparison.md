# Ideal Closed-Pipe Model and Clarinet Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sample A an honest, audible ideal closed-pipe model with only odd harmonics, retain the original clarinet recording as an explicit real-world comparison, and show answer images.

**Architecture:** A bundled WAV gives the existing native-player and analyser pipeline a deterministic 300 Hz, 900 Hz, 1500 Hz model sound. The existing `.sample-card` controller gains a configurable initial stage so the clarinet comparison exposes its spectrum immediately. Generated illustrations live under `assets/air-column-spectrum/reveals/` and are rendered only in answer or comparison content.

**Tech Stack:** Static HTML/CSS, Node.js binary WAV generation, Web Audio API analyser, Node built-in test runner.

## Global Constraints

- A is labeled as an ideal model, never as a real instrument.
- A contains 300 Hz, 900 Hz, and 1500 Hz only, corresponding to f, 3f, 5f.
- The original CC0 clarinet WAV remains available as the disclosed real-world comparison.
- B and C remain the recorder and classical-guitar recordings.
- Four reveal illustrations have no embedded text and are shown only after identity/model disclosure.
- No dependencies are added.

---

### Task 1: Test and add model/audio/image assets

**Files:**
- Create: `assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav`
- Create: `assets/air-column-spectrum/reveals/closed-pipe.png`
- Create: `assets/air-column-spectrum/reveals/recorder.png`
- Create: `assets/air-column-spectrum/reveals/guitar.png`
- Create: `assets/air-column-spectrum/reveals/clarinet.png`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Produces: a non-empty PCM WAV model asset and four non-empty PNG assets.
- Produces: exact path references used by the page.

- [ ] **Step 1: Write failing asset tests**

```js
for (const file of [
  'sample-a-ideal-closed-pipe.wav',
  'reveals/closed-pipe.png',
  'reveals/recorder.png',
  'reveals/guitar.png',
  'reveals/clarinet.png',
]) {
  const path = new URL(`../assets/air-column-spectrum/${file}`, import.meta.url);
  assert.equal(existsSync(path), true);
  assert.ok(statSync(path).size > 4096);
}
```

- [ ] **Step 2: Run focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because model sound and reveal assets do not exist.

- [ ] **Step 3: Create the deterministic model WAV and install generated assets**

Run this Node program from the project root to create a 6-second, 44.1 kHz, 16-bit mono WAV with only 300, 900 and 1500 Hz components:

```js
const fs = require('fs');
const rate = 44100, seconds = 6, samples = rate * seconds;
const dataBytes = samples * 2, out = Buffer.alloc(44 + dataBytes);
out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4);
out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36);
out.writeUInt32LE(dataBytes, 40);
for (let n = 0; n < samples; n += 1) {
  const t = n / rate, fade = Math.min(1, t / 0.08, (seconds - t) / 0.18);
  const value = 0.55 * fade * (Math.sin(2 * Math.PI * 300 * t) + 0.45 * Math.sin(2 * Math.PI * 900 * t) + 0.25 * Math.sin(2 * Math.PI * 1500 * t));
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + n * 2);
}
fs.writeFileSync('assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav', out);
```

Copy the four generated PNG files into the listed `reveals/` paths.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: all asset tests pass.

- [ ] **Step 5: Commit**

```bash
git add assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav assets/air-column-spectrum/reveals tests/air-column-spectrum-page.test.mjs
git commit -m "feat: add ideal closed-pipe media assets"
```

### Task 2: Test and add the model card, real clarinet comparison, and reveal illustrations

**Files:**
- Modify: `air-column-spectrum.html`
- Modify: `air-column-spectrum.js`
- Modify: `assets/air-column-spectrum/CREDITS.md`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Consumes: the model WAV, original `sample-a.wav`, and four reveal images.
- Produces: Sample A source `sample-a-ideal-closed-pipe.wav`; `#clarinet-comparison`; `data-start-stage="spectrum"`.
- Produces: `setupCard()` initialization through `updateStage(card.dataset.startStage || 'listen')`.

- [ ] **Step 1: Write failing page tests**

```js
assert.match(page, /id="sample-a"[^>]*sample-a-ideal-closed-pipe\.wav/);
assert.match(page, /理想一端閉管模型聲/);
assert.match(page, /300 Hz.*900 Hz.*1500 Hz/s);
assert.match(page, /id="clarinet-comparison"/);
assert.match(page, /id="sample-clarinet-real"[^>]*sample-a\.wav/);
assert.match(page, /data-start-stage="spectrum"/);
assert.equal((page.match(/class="reveal-image"/g) || []).length, 4);
```

- [ ] **Step 2: Run focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because A still points at the clarinet and no comparison/image markup exists.

- [ ] **Step 3: Add the minimal page and controller changes**

- Change A's source to `sample-a-ideal-closed-pipe.wav`; reveal that it is a model and explicitly list (f=300), (3f=900), (5f=1500) Hz.
- Place `closed-pipe.png`, `recorder.png`, and `guitar.png` inside their answer stages with `class="reveal-image"`.
- Append `#clarinet-comparison` after the three anonymous cards. It uses the original `sample-a.wav`, its `clarinet.png`, and `data-start-stage="spectrum"`; its copy says the real D5 clarinet has strong 2f and is not a clean closed-pipe demonstration.
- Add compact responsive CSS for `.reveal-image` and the comparison card.
- Update the credit table to distinguish the generated model A from the retained FreePats clarinet comparison.
- Replace the final initialization with:
```js
updateStage(card.dataset.startStage || 'listen');
```

- [ ] **Step 4: Run focused and complete tests**

Run: `node --test tests/air-column-spectrum-page.test.mjs; node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum.html air-column-spectrum.js assets/air-column-spectrum/CREDITS.md tests/air-column-spectrum-page.test.mjs
git commit -m "feat: compare ideal pipe model with clarinet recording"
```

