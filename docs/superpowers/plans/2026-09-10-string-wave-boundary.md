# 雙繩交界繩波模擬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立有數值／概念雙模式、能量比例讀值與公式推導頁的雙繩交界繩波模擬。

**Architecture:** `string-wave-physics.js` 封裝可測試的接點物理與離散繩更新；兩張 HTML 頁各自以小型控制器讀取同一模組。模擬頁用 Canvas 呈現動畫，推導頁從 URL 的 `muLeft`、`muRight` 顯示相同係數的計算例。

**Tech Stack:** 靜態 HTML、CSS、ES modules、Canvas 2D、Node `node:test`；不新增依賴。

## Global Constraints

- 固定且相同的張力 `T = 100`；只允許正線密度。
- `v=sqrt(T/μ)`；`r=(v2-v1)/(v1+v2)`；`t=2v2/(v1+v2)`；`R=r²`；`τ=1-R`。
- 支援單一脈波／連續波、正弦／三角波、播放、暫停、重設、慢動作與輕→重／重→輕／相同繩。
- 數值模式採 CFL 安全時間步長；不產生端點反射。
- 推導頁必須有五步推導，顯示帶入數值，並可返回模擬。

---

### Task 1: 寫出物理 API、測試並實作離散繩

**Files:**
- Create: `tests/string-wave-physics.test.mjs`
- Create: `string-wave-physics.js`

**Interfaces:**
- Produces: `calculateBoundary(muLeft, muRight, tension)` → `{vLeft,vRight,amplitudeReflection,amplitudeTransmission,energyReflection,energyTransmission}`。
- Produces: `normalize(value,min,max,fallback)`、`sampleShape(kind, phase)`、`pulseSample(kind, distance, width)`。
- Produces: `createStringState(options)`、`stepStringState(state,tension)`。

- [ ] **Step 1: 寫失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoundary, createStringState, stepStringState, pulseSample, sampleShape } from '../string-wave-physics.js';

test('light to heavy has inverted reflection and conserved energy', () => {
  const c = calculateBoundary(1, 4, 100);
  assert.ok(c.vLeft > c.vRight); assert.ok(c.amplitudeReflection < 0);
  assert.ok(Math.abs(c.energyReflection + c.energyTransmission - 1) < 1e-12);
});
test('heavy to light has non-inverted reflection', () => assert.ok(calculateBoundary(4, 1, 100).amplitudeReflection > 0));
test('identical strings transmit all energy', () => assert.equal(calculateBoundary(2, 2, 100).energyTransmission, 1));
test('wave samples are bounded', () => {
  for (const kind of ['sine', 'triangle']) {
    assert.ok(Math.abs(sampleShape(kind, 1.2)) <= 1);
    assert.equal(pulseSample(kind, 1.01, 1), 0);
  }
});
test('numerical string stays finite after a CFL-safe step sequence', () => {
  const s = createStringState({ muLeft: 1, muRight: 4, tension: 100, pointCount: 160, length: 16 });
  s.y[25] = 1; for (let i = 0; i < 120; i += 1) stepStringState(s, 100);
  assert.ok([...s.y].every(Number.isFinite));
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `node --test tests/string-wave-physics.test.mjs`  
Expected: FAIL，因 `string-wave-physics.js` 尚不存在。

- [ ] **Step 3: 實作最小 API**

```js
export function calculateBoundary(muLeft, muRight, tension) {
  const vLeft = Math.sqrt(tension / muLeft), vRight = Math.sqrt(tension / muRight);
  const amplitudeReflection = (vRight - vLeft) / (vLeft + vRight);
  const amplitudeTransmission = 2 * vRight / (vLeft + vRight);
  const energyReflection = amplitudeReflection ** 2;
  return { vLeft, vRight, amplitudeReflection, amplitudeTransmission, energyReflection, energyTransmission: 1 - energyReflection };
}
export function sampleShape(kind, phase) { return kind === 'triangle' ? 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI)) : Math.sin(phase); }
export function pulseSample(kind, distance, width) { return Math.abs(distance) > width ? 0 : kind === 'triangle' ? 1 - Math.abs(distance / width) : Math.sin((distance / width + 1) * Math.PI); }
export function createStringState({ muLeft, muRight, tension, pointCount, length }) {
  const dx = length / (pointCount - 1), junctionIndex = Math.floor((pointCount - 1) / 2);
  return { y:new Float64Array(pointCount), previousY:new Float64Array(pointCount), masses:Float64Array.from({length:pointCount}, (_, i) => (i <= junctionIndex ? muLeft : muRight) * dx), dx, dt:.68 * dx / Math.sqrt(tension / Math.min(muLeft, muRight)), junctionIndex, time:0 };
}
export function stepStringState(s, tension) {
  const next = new Float64Array(s.y.length);
  for (let i = 1; i < s.y.length - 1; i += 1) next[i] = 2 * s.y[i] - s.previousY[i] + s.dt ** 2 * tension * (s.y[i + 1] - 2 * s.y[i] + s.y[i - 1]) / (s.dx * s.masses[i]);
  s.previousY = s.y; s.y = next; s.time += s.dt; return s;
}
```

- [ ] **Step 4: 驗證全數通過**

Run: `node --test tests/string-wave-physics.test.mjs`  
Expected: PASS，五個測試皆成功。

- [ ] **Step 5: Commit**

```bash
git add string-wave-physics.js tests/string-wave-physics.test.mjs
git commit -m "feat: add string wave physics engine"
```

### Task 2: 建立模擬頁及雙模式控制器

**Files:**
- Create: `string-wave-boundary.html`
- Create: `string-wave-boundary.js`

**Interfaces:**
- Consumes: Task 1 的所有物理 API。
- Produces: `applyScenario(name)`，接受 `light-heavy`、`heavy-light`、`equal`。
- Produces: `renderFrame(timestamp)`，在數值或概念模式繪圖。

- [ ] **Step 1: 建立頁面所需元素**

```html
<nav><a href="./index.html">← 物理互動模擬實驗室</a><a id="derivationLink" href="./string-wave-derivation.html">查看公式推導 →</a></nav>
<section class="workbench"><aside class="panel"><label>左繩線密度 μ₁ <input id="muLeft" type="range" min="0.25" max="8" step="0.05" value="1"></label><label>右繩線密度 μ₂ <input id="muRight" type="range" min="0.25" max="8" step="0.05" value="4"></label><select id="signalType"><option value="pulse">單一脈波</option><option value="continuous">連續週期波</option></select><select id="shape"><option value="sine">正弦波</option><option value="triangle">三角波</option></select><button data-scenario="light-heavy">輕→重</button><button data-scenario="heavy-light">重→輕</button><button data-scenario="equal">相同繩</button><button id="playButton">暫停</button><button id="resetButton">重設</button><button id="slowButton">慢動作</button></aside><section class="panel"><button data-mode="numeric">數值模擬</button><button data-mode="concept">概念拆解</button><canvas id="waveCanvas" width="1120" height="520"></canvas></section><aside class="panel"><dl><dt>v₁</dt><dd data-readout="vLeft"></dd><dt>v₂</dt><dd data-readout="vRight"></dd><dt>R</dt><dd data-readout="R"></dd><dt>τ</dt><dd data-readout="tau"></dd><dt>R + τ</dt><dd data-readout="sum"></dd></dl></aside></section>
<script type="module" src="./string-wave-boundary.js"></script>
```

- [ ] **Step 2: 寫入單欄斷點與語意色彩**

```css
.workbench{display:grid;grid-template-columns:minmax(210px,.82fr) minmax(420px,2.2fr) minmax(210px,.82fr);gap:18px}.panel{padding:20px;border:1px solid #cbd9ea;border-radius:20px;background:#fff}.stage canvas{display:block;width:100%;height:auto}@media(max-width:920px){.workbench{grid-template-columns:1fr}.workbench>section{order:-1}}
```

- [ ] **Step 3: 實作同步狀態、讀值和推導頁連結**

```js
function refreshReadouts() {
  const c = calculateBoundary(state.muLeft, state.muRight, 100);
  const values = { vLeft:c.vLeft.toFixed(2), vRight:c.vRight.toFixed(2), R:`${(c.energyReflection * 100).toFixed(1)}%`, tau:`${(c.energyTransmission * 100).toFixed(1)}%`, sum:`${((c.energyReflection + c.energyTransmission) * 100).toFixed(1)}%` };
  document.querySelectorAll('[data-readout]').forEach(node => node.textContent = values[node.dataset.readout]);
  derivationLink.href = `./string-wave-derivation.html?muLeft=${state.muLeft}&muRight=${state.muRight}`;
}
```

- [ ] **Step 4: 實作 Canvas 的數值與概念繪圖**

```js
function renderConcept(ctx) {
  const c = calculateBoundary(state.muLeft, state.muRight, 100);
  drawTravellingWave(ctx, '#277be8', 'left', 1, state.amplitude, c.vLeft);
  drawTravellingWave(ctx, '#7959d8', 'left', -1, state.amplitude * c.amplitudeReflection, c.vLeft);
  drawTravellingWave(ctx, '#e98628', 'right', 1, state.amplitude * c.amplitudeTransmission, c.vRight);
}
function renderFrame(timestamp) {
  advance(Math.min((timestamp - lastTime) / 1000, .03) * (state.slow ? .25 : 1));
  state.mode === 'numeric' ? renderNumeric(context) : renderConcept(context);
  lastTime = timestamp; requestAnimationFrame(renderFrame);
}
```

- [ ] **Step 5: 手動驗證**

Run: 開啟 `string-wave-boundary.html`。  
Expected: 三個預設、四種波形組合、兩種模式、播放控制和推導連結均可用；讀值始終顯示 `R + τ = 100.0%`。

- [ ] **Step 6: Commit**

```bash
git add string-wave-boundary.html string-wave-boundary.js
git commit -m "feat: add interactive string boundary simulation"
```

### Task 3: 建立可帶入線密度的五步公式推導頁

**Files:**
- Create: `string-wave-derivation.html`
- Create: `string-wave-derivation.js`

**Interfaces:**
- Consumes: `calculateBoundary(muLeft, muRight, 100)`。
- Consumes: URL search params `muLeft`、`muRight`。
- Produces: 供人閱讀的五個推導區塊與回模擬連結。

- [ ] **Step 1: 建立五段教學內容與回程導覽**

```html
<nav><a id="backToSimulation" href="./string-wave-boundary.html">← 返回模擬</a></nav>
<main><p class="eyebrow">固定張力・逐步推導</p><h1>兩條繩交界的反射與透射</h1><section class="step"><h2>1. 兩段繩的波速</h2><p>v = √(T / μ)</p><div data-example="speed"></div></section><section class="step"><h2>2. 接點必須連續</h2><p>Ai + Ar = At</p><p>k₁(Ai − Ar) = k₂At</p></section><section class="step"><h2>3. 振幅係數</h2><p>r = (v₂ − v₁) / (v₁ + v₂)</p><p>t = 2v₂ / (v₁ + v₂)</p><div data-example="amplitude"></div></section><section class="step"><h2>4. 能量守恆</h2><p>P ∝ μω²A²v</p><p>R = r²，τ = (μ₂v₂ / μ₁v₁)t² = 1 − R</p><div data-example="energy"></div></section><section class="step"><h2>5. 方向與相位</h2><div data-example="phase"></div></section></main>
<script type="module" src="./string-wave-derivation.js"></script>
```

- [ ] **Step 2: 實作 URL 驗證與動態數值例子**

```js
import { calculateBoundary } from './string-wave-physics.js';
const params = new URLSearchParams(location.search);
const withinRange = value => Number.isFinite(value) && value >= .25 && value <= 8;
const muLeft = Number(params.get('muLeft')), muRight = Number(params.get('muRight'));
const safeLeft = withinRange(muLeft) ? muLeft : 1, safeRight = withinRange(muRight) ? muRight : 4;
const c = calculateBoundary(safeLeft, safeRight, 100);
document.querySelector('[data-example="speed"]').textContent = `μ₁ = ${safeLeft.toFixed(2)}、μ₂ = ${safeRight.toFixed(2)}，所以 v₁ = ${c.vLeft.toFixed(2)}、v₂ = ${c.vRight.toFixed(2)}。`;
document.querySelector('[data-example="energy"]').textContent = `R = ${(c.energyReflection * 100).toFixed(1)}%，τ = ${(c.energyTransmission * 100).toFixed(1)}%，合計 100.0%。`;
backToSimulation.href = `./string-wave-boundary.html?muLeft=${safeLeft}&muRight=${safeRight}`;
```

- [ ] **Step 3: 手動驗證推導頁**

Run: 開啟 `string-wave-derivation.html?muLeft=1&muRight=4`，再開啟 `string-wave-derivation.html?muLeft=-1&muRight=x`。  
Expected: 第一個顯示輕→重、反相與正確係數；第二個安全回復預設值；返回連結帶回有效線密度。

- [ ] **Step 4: Commit**

```bash
git add string-wave-derivation.html string-wave-derivation.js
git commit -m "feat: add string wave derivation page"
```

### Task 4: 加入首頁、文件與完整驗證

**Files:**
- Modify: `index.html`
- Modify: `README.md`

- [ ] **Step 1: 加入首頁入口**

```html
<article class="card"><div class="preview wave-preview" aria-hidden="true"></div><div class="card-body"><div class="tag-row"><span class="tag cyan">繩波</span><span class="tag violet">反射與透射</span></div><h3>雙繩交界的繩波</h3><p class="description">調整線密度，觀察反射、透射、能量守恆，並逐步閱讀公式推導。</p><a class="launch" href="./string-wave-boundary.html">開啟模擬 <span>→</span></a></div></article>
```

- [ ] **Step 2: 更新 README**

```markdown
- [雙繩交界的繩波：反射、透射與能量守恆](./string-wave-boundary.html)
- [雙繩交界繩波的公式推導](./string-wave-derivation.html)
```

- [ ] **Step 3: 執行自動與視覺驗證**

Run: `node --test tests/string-wave-physics.test.mjs`  
Expected: PASS，係數、相位、能量、波形和數值穩定性全部成功。

Run: 分別以桌面與 390px 寬度開啟兩頁。  
Expected: 無 console error，Canvas 不溢出，五段推導清楚可讀，導覽連結正確。

- [ ] **Step 4: Commit**

```bash
git add index.html README.md
git commit -m "docs: link string wave lessons from lab"
```

### Task 5: 改善播放與速度控制

**Files:**
- Modify: string-wave-physics.js
- Modify: tests/string-wave-physics.test.mjs
- Modify: string-wave-boundary.html
- Modify: string-wave-boundary.js

**Interfaces:**
- Produces normalizePlaybackSpeed(value)，只回傳 0.25、0.5 或 1。

- [ ] **Step 1: 寫入失敗測試**

```js
import { normalizePlaybackSpeed } from '../string-wave-physics.js';
test('only supported playback speeds are accepted', () => {
  assert.equal(normalizePlaybackSpeed(.25), .25);
  assert.equal(normalizePlaybackSpeed(.5), .5);
  assert.equal(normalizePlaybackSpeed(3), .25);
});
```

- [ ] **Step 2: 確認測試失敗**

Run: node --test tests/string-wave-physics.test.mjs
Expected: FAIL，缺少 normalizePlaybackSpeed。

- [ ] **Step 3: 最小實作**

```js
export function normalizePlaybackSpeed(value) {
  return [0.25, 0.5, 1].includes(value) ? value : 0.25;
}
```

在頁面新增速度下拉選單（0.25×、0.5×、1×），狀態預設為 0.25；播放按鈕的文字和 aria-pressed 隨播放狀態更新；動畫步進將 delta 乘以 state.speed。

- [ ] **Step 4: 驗證與提交**

Run: node --test tests/string-wave-physics.test.mjs && node --check string-wave-boundary.js
Expected: PASS，預設為 0.25×。

```bash
git add string-wave-physics.js tests/string-wave-physics.test.mjs string-wave-boundary.html string-wave-boundary.js
git commit -m "feat: add wave playback speed controls"
```

## Plan self-review

- Spec coverage: Task 1 實作與驗證全部接點物理；Task 2 覆蓋雙模式模擬和控制；Task 3 覆蓋五步推導、URL 帶入與返回連結；Task 4 覆蓋首頁、文件、測試與雙尺寸視覺檢查。
- Type consistency: 後續頁面僅使用 Task 1 定義的 `calculateBoundary`、`createStringState`、`stepStringState`、`sampleShape`、`pulseSample`。
