# Recorder and Fourier Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous D5 recorder sample with a CC0 D5 alto-recorder recording and append a mathematically accurate Fourier-transform extension after the activity.

**Architecture:** The audio asset and its attribution remain colocated in `assets/air-column-spectrum/`; only Sample B's source MIME-friendly filename changes. A self-contained final `section` in `air-column-spectrum.html` provides a waveform-to-spectrum bridge, Fourier-series derivation, DFT/FFT connection, and applications without changing reveal-state JavaScript.

**Tech Stack:** Static HTML/CSS, native audio player, Node built-in test runner.

## Global Constraints

- All three activity samples remain D5 (about 587 Hz); only Sample B changes.
- Sample B is the CC0 `Alto Recorder D5` recording by sgossner, served from Freesound's official preview URL.
- The blind-listening section remains free of instrument names and boundary models.
- Fourier content appears only after the comparison/reveal portion.
- Fourier math distinguishes continuous Fourier-series notation from sampled DFT/FFT calculation.
- No dependency is added.

---

### Task 1: Test and replace Sample B with a CC0 D5 alto recorder

**Files:**
- Create: `assets/air-column-spectrum/sample-b.mp3`
- Modify: `assets/air-column-spectrum/CREDITS.md`
- Modify: `air-column-spectrum.html`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Produces: Sample B source `./assets/air-column-spectrum/sample-b.mp3`.
- Produces: attribution containing `Alto Recorder D5`, `sgossner`, `D5`, the Freesound source URL, and `CC0 1.0`.

- [ ] **Step 1: Write the failing test**

```js
assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-b\.mp3"/);
assert.match(credits, /Alto Recorder D5/);
assert.match(credits, /sgossner/);
assert.match(credits, /D5/);
assert.match(credits, /freesound\.org\/people\/sgossner\/sounds\/242028/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because Sample B still names the old FLAC asset and its FreePats credit.

- [ ] **Step 3: Make the minimal asset and attribution change**

Download Freesound's official HQ preview of the CC0 recording to `assets/air-column-spectrum/sample-b.mp3`:

```powershell
Invoke-WebRequest -UseBasicParsing 'https://cdn.freesound.org/previews/242/242028_2475994-hq.mp3' -OutFile 'assets/air-column-spectrum/sample-b.mp3'
```

Change Sample B's audio element to:

```html
<audio id="sample-b" controls preload="metadata" src="./assets/air-column-spectrum/sample-b.mp3"></audio>
```

Change its credit row to identify the source as `Alto Recorder D5`, performer/recorder `sgossner`, source URL `https://freesound.org/people/sgossner/sounds/242028/`, and CC0 1.0. Keep the retired `sample-b.flac` unreferenced until the final cleanup step.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: every page test passes and the new MP3 is non-empty.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum.html assets/air-column-spectrum/sample-b.mp3 assets/air-column-spectrum/CREDITS.md tests/air-column-spectrum-page.test.mjs
git commit -m "feat: replace recorder sample with clearer D5 recording"
```

### Task 2: Test and add the final Fourier explanation

**Files:**
- Modify: `air-column-spectrum.html`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Produces: `#fourier-extension`, located after `.compare`, with headings `傅立葉轉換：為什麼能拆出頻率？` and `從連續波形到電腦的 FFT`.
- Produces: the formulas `f(t)`, the orthogonality integral, `a_m`, and `X_k`.
- Produces: application labels `手機調音器`, `等化器`, and `MRI`.

- [ ] **Step 1: Write the failing test**

```js
const fourierIndex = page.indexOf('id="fourier-extension"');
const compareIndex = page.indexOf('class="compare"');
assert.ok(fourierIndex > compareIndex);
for (const phrase of ['正交', 'a_m', 'X_k', 'FFT', '手機調音器', '等化器', 'MRI']) {
  assert.match(page, new RegExp(phrase));
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because the final Fourier section does not exist.

- [ ] **Step 3: Add the self-contained final section**

Append a `<section id="fourier-extension" class="compare fourier-extension">` after the comparison section. Include these exact mathematical statements in readable HTML:

```html
<p>f(t) = a₀/2 + Σ[aₙ cos(nω₀t) + bₙ sin(nω₀t)]</p>
<p>∫₀ᵀ cos(nω₀t) cos(mω₀t) dt = 0（n ≠ m）</p>
<p>aₘ = (2/T) ∫₀ᵀ f(t) cos(mω₀t) dt</p>
<p>Xₖ = Σₙ₌₀ᴺ⁻¹ xₙe⁻ⁱ²πᵏⁿ⁄ᴺ</p>
```

Explain that orthogonality makes each coefficient a frequency-specific projection; state that FFT is a fast algorithm for the DFT; explain that a longer recording window separates nearby frequencies more finely. Add compact cards for a phone tuner, equalizer/timbre analysis, and MRI reconstruction.

- [ ] **Step 4: Run focused and complete tests**

Run: `node --test tests/air-column-spectrum-page.test.mjs; node --test tests/*.test.mjs`

Expected: all page tests and the full suite pass with zero failures.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum.html tests/air-column-spectrum-page.test.mjs
git commit -m "feat: add Fourier transform extension"
```

### Task 3: Remove the retired recorder file after source replacement is verified

**Files:**
- Delete: `assets/air-column-spectrum/sample-b.flac`

**Interfaces:**
- Consumes: Sample B's working `.mp3` reference and passing asset tests.
- Produces: one current recorder asset without a redundant, unused file.

- [ ] **Step 1: Confirm no reference remains**

Run: `rg -n 'sample-b\\.flac' air-column-spectrum.html assets tests`

Expected: no matches.

- [ ] **Step 2: Delete only the retired source asset**

```powershell
Remove-Item -LiteralPath 'assets/air-column-spectrum/sample-b.flac'
```

- [ ] **Step 3: Run complete tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 4: Commit**

```bash
git add -u assets/air-column-spectrum/sample-b.flac
git commit -m "chore: remove retired recorder sample"
```

