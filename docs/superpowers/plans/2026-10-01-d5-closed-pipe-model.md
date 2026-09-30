# D5 Ideal Closed-Pipe Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the anonymous ideal closed-pipe model at the same approximate D5 pitch as the recorder and guitar while preserving an immediately visible f, 3f, 5f pattern.

**Architecture:** Keep one model WAV asset, but regenerate it with 587 Hz, 1761 Hz, and 2935 Hz partials. Add per-card frequency-axis data attributes so only sample A expands to 3200 Hz; `setupCard` reads those values and passes them to the existing Canvas drawing function, preserving the 1800 Hz default for every other card.

**Tech Stack:** Static HTML, ES modules, Canvas/Web Audio API, Node built-in test runner, PCM WAV asset.

## Global Constraints

- A remains anonymous until its normal reveal stage and is explicitly described as a model, not a live instrument.
- A uses approximately 587 Hz, 1761 Hz, and 2935 Hz only; no external media is added.
- A displays 0–3200 Hz with 400 Hz tick spacing; B, C, and real clarinet retain 0–1800 Hz with 300 Hz ticks.
- No new runtime dependency is added.

---

## File Structure

- `assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav`: six-second D5 closed-pipe model signal.
- `air-column-spectrum.html`: sample-A axis metadata and explanatory D5 text.
- `air-column-spectrum.js`: reads per-card axis metadata and gives it to the Canvas renderer.
- `assets/air-column-spectrum/CREDITS.md`: documents the model’s revised partials.
- `tests/air-column-spectrum-page.test.mjs`: verifies model partials, card metadata, and default-axis preservation.

### Task 1: Specify the D5 model and card-specific axis in tests

**Files:**
- Modify: `tests/air-column-spectrum-page.test.mjs:27-58,108-116`

**Interfaces:**
- Consumes: the PCM WAV at `assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav` and sample-A `<article data-sample="a">` metadata.
- Produces: regression coverage requiring 587 Hz / 1761 Hz / 2935 Hz signals and a 3200 Hz / 400 Hz sample-A axis.

- [ ] **Step 1: Replace the model-audio assertions with the intended D5 components**

```js
assert.ok(magnitudeAt(587) > 0.5);
assert.ok(magnitudeAt(1761) > 0.2);
assert.ok(magnitudeAt(2935) > 0.1);
for (const frequency of [1174, 2348, 3522]) assert.ok(magnitudeAt(frequency) < 0.001);
```

- [ ] **Step 2: Add page assertions for A-only axis metadata**

```js
assert.match(page, /data-sample="a"[^>]*data-spectrum-axis-max-hz="3200"/);
assert.match(page, /data-sample="a"[^>]*data-spectrum-axis-tick-hz="400"/);
assert.match(script, /card\.dataset\.spectrumAxisMaxHz/);
assert.match(script, /card\.dataset\.spectrumAxisTickHz/);
```

- [ ] **Step 3: Run the focused test to verify RED**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because the existing WAV contains 300 Hz / 900 Hz / 1500 Hz and sample A has no per-card axis metadata.

- [ ] **Step 4: Commit the failing test specification**

```bash
git add tests/air-column-spectrum-page.test.mjs
git commit -m "test: specify D5 closed-pipe model"
```

### Task 2: Regenerate model audio and render a per-card frequency axis

**Files:**
- Modify: `assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav`
- Modify: `air-column-spectrum.html:31-37,79`
- Modify: `air-column-spectrum.js:19-49,64-123`
- Modify: `assets/air-column-spectrum/CREDITS.md:3-8`
- Test: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Consumes: `data-spectrum-axis-max-hz` and `data-spectrum-axis-tick-hz` from a card, with no attributes meaning the exported default constants.
- Produces: `drawSpectrum(canvas, values, hertzPerBin, axisMaxHz, axisTickHz)` and a regenerated D5 PCM WAV.

- [ ] **Step 1: Regenerate the six-second mono PCM WAV with D5 odd harmonics**

Run this Node command from the repository root:

```powershell
$waveCode = @'
const fs = require("fs");
const rate = 44100, seconds = 6, samples = rate * seconds;
const dataBytes = samples * 2, out = Buffer.alloc(44 + dataBytes);
out.write("RIFF", 0); out.writeUInt32LE(36 + dataBytes, 4);
out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28);
out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36);
out.writeUInt32LE(dataBytes, 40);
for (let n = 0; n < samples; n += 1) {
  const t = n / rate;
  const fade = Math.min(1, t / 0.08, (seconds - t) / 0.18);
  const value = 0.55 * fade * (
    Math.sin(2 * Math.PI * 587 * t) +
    0.45 * Math.sin(2 * Math.PI * 1761 * t) +
    0.25 * Math.sin(2 * Math.PI * 2935 * t)
  );
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + n * 2);
}
fs.writeFileSync("assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav", out);
'@
node -e $waveCode
```

- [ ] **Step 2: Add A-only metadata and revise copy**

Change the opening A article to include both attributes:

```html
<article class="sample-card" data-sample="a" data-stage="listen" data-spectrum-axis-max-hz="3200" data-spectrum-axis-tick-hz="400">
```

Replace the reveal sentence with:

```html
它刻意只放入約 587 Hz、1761 Hz、2935 Hz 三個成分，也就是 f、3f、5f；它與樣本 B、C 同為 D5 音高。
```

Replace the Fourier paragraph’s 300 Hz reference with `理想閉管模型也以約 587 Hz 的 D5 為基音` and update the Credits model row to list the same three frequencies.

- [ ] **Step 3: Let `drawSpectrum` accept an axis and retain defaults**

```js
function drawSpectrum(
  canvas,
  values,
  hertzPerBin,
  axisMaxHz = SPECTRUM_AXIS_MAX_HZ,
  axisTickHz = SPECTRUM_AXIS_TICK_HZ,
) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#10233d';
  context.fillRect(0, 0, width, height);
  const plot = { left: 48, right: 16, top: 14, bottom: 38 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const baseline = height - plot.bottom;
  context.strokeStyle = 'rgba(255,255,255,.18)';
  context.lineWidth = 1;
  for (let row = 1; row < 4; row += 1) {
    const y = plot.top + (plotHeight * row) / 4;
    context.beginPath(); context.moveTo(plot.left, y); context.lineTo(width - plot.right, y); context.stroke();
  }
  context.font = '13px Arial';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(255,255,255,.82)';
  for (let hertz = 0; hertz <= axisMaxHz; hertz += axisTickHz) {
    const x = plot.left + (hertz / axisMaxHz) * plotWidth;
    context.strokeStyle = 'rgba(255,255,255,.22)';
    context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, baseline); context.stroke();
    context.fillText(String(hertz), x, height - 20);
  }
  context.fillText('頻率（Hz）', plot.left + plotWidth / 2, height - 5);
  const visible = Math.min(values.length, Math.floor(axisMaxHz / hertzPerBin) + 1);
  const barWidth = plotWidth / visible;
  for (let index = 0; index < visible; index += 1) {
    const barHeight = (values[index] / 255) * plotHeight;
    context.fillStyle = index % 2 ? '#6bd8dc' : '#78a8ff';
    context.fillRect(plot.left + index * barWidth, baseline - barHeight, Math.max(1, barWidth), barHeight);
  }
  context.textAlign = 'start';
}
```

At the start of `setupCard`, add:

```js
const spectrumAxisMaxHz = Number(card.dataset.spectrumAxisMaxHz) || SPECTRUM_AXIS_MAX_HZ;
const spectrumAxisTickHz = Number(card.dataset.spectrumAxisTickHz) || SPECTRUM_AXIS_TICK_HZ;
```

Then call:

```js
drawSpectrum(canvas, displayValues, hertzPerBin, spectrumAxisMaxHz, spectrumAxisTickHz);
```

- [ ] **Step 4: Run the focused regression test to verify GREEN**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: PASS with every ideal-model and page-axis test green.

- [ ] **Step 5: Run the full suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit the implementation**

```bash
git add air-column-spectrum.html air-column-spectrum.js assets/air-column-spectrum/CREDITS.md assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav tests/air-column-spectrum-page.test.mjs
git commit -m "feat: tune closed-pipe model to D5"
```

### Task 3: Inspect the classroom flow and release

**Files:**
- Verify: `air-column-spectrum.html`
- Verify: `assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav`

**Interfaces:**
- Consumes: the deployed static page and freshly passing test suite.
- Produces: a GitHub Pages page where A reveals the D5 1f/3f/5f pattern and B/C retain their prior scale.

- [ ] **Step 1: Start a local static server**

Run: `python -m http.server 4173 --bind 127.0.0.1`

Expected: the page is available at `http://127.0.0.1:4173/air-column-spectrum.html`.

- [ ] **Step 2: Verify visible teaching behavior in a browser**

Confirm that sample A stays anonymous at first; after its reveal it names the ideal model, displays 587 Hz / 1761 Hz / 2935 Hz, and its spectrum axis reaches 3200 Hz. Confirm B and C still use their prior 1800 Hz axis.

- [ ] **Step 3: Merge and publish after fresh full verification**

Run: `node --test tests/*.test.mjs`

Expected: PASS with zero failures before merging to `main` and pushing `main` to `origin`.
