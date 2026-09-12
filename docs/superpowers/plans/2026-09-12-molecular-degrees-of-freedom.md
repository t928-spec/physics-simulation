# 分子自由度運動拆解模擬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個離線可用的互動頁面，以動畫拆解單原子、雙原子和線型三原子分子的平移、轉動、振動，並正確區分機械模式數與能量均分定理中的 f。

**Architecture:** 將分子資料、情境選擇、自由度計數和 3D 原子座標放進獨立 ES module，並以 Node 內建測試守住物理計數。獨立 HTML 頁面匯入該 module 以生成控制面板、讀值和 Canvas 動畫；首頁只增加一張入口卡片。

**Tech Stack:** HTML5、CSS、原生 JavaScript（ES modules）、Canvas 2D、`requestAnimationFrame`、Node.js 內建 `node:test`。

## Global Constraints

- 全部內容使用繁體中文，不用外部套件、CDN、網路請求或建置步驟。
- 新頁面固定為 `molecular-degrees-of-freedom.html`；核心資料與數學模組固定為 `molecular-degrees-of-freedom.js`。
- 畫面必須分列「機械座標／正規模態數」和「能量均分定理的二次項數」；禁止混為同一個數。
- 雙原子剛性情境的熱容量 `f = 5`；加入一個伸縮振動正規模態後的熱容量 `f = 7`，因其動能與位能各給一個二次項。
- 線型三原子只計 3 個平移與兩個垂直分子軸轉動；不可列入繞分子軸轉動。
- 動畫以明確、可重現的週期函數產生，不可用隨機走動。
- 所有控制項必須可鍵盤操作、有文字標籤；窄螢幕需堆疊布局。

---

## File structure

- `molecular-degrees-of-freedom.js`：純資料／物理邏輯；輸出分子定義、情境模式、計數摘要與座標。
- `tests/molecular-degrees-of-freedom.test.mjs`：Node 測試分子模式、情境、計數、座標有限性與入口。
- `molecular-degrees-of-freedom.html`：頁面語意結構、樣式、控制器、Canvas 繪圖與動畫生命週期。
- `index.html`：在既有卡片格中增加新頁入口。
- `README.md`：在模擬清單中增加相同入口。

### Task 1: 建立可驗證的自由度資料與運動模型

**Files:**
- Create: `tests/molecular-degrees-of-freedom.test.mjs`
- Create: `molecular-degrees-of-freedom.js`

**Interfaces:**
- Produces `MOLECULES`, `getPresetModeIds(moleculeId, preset)`, `summarizeModes(moleculeId, enabledIds)`, `getAtomPositions(moleculeId, enabledIds, time)`.
- `summarizeModes` returns `{ visibleCount, equipartitionF, parts, enabledModes }`; each `parts` item has `{ kind, visible, equipartition }`.
- `getAtomPositions` returns `{ x, y, z, element }[]`, all finite.

- [ ] **Step 1: Write the failing physical-model tests**

Create `tests/molecular-degrees-of-freedom.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOLECULES, getPresetModeIds, summarizeModes, getAtomPositions } from '../molecular-degrees-of-freedom.js';

test('molecule definitions include the intended independent modes', () => {
  assert.deepEqual(Object.keys(MOLECULES), ['monoatomic', 'diatomic', 'linear-triatomic']);
  assert.equal(MOLECULES.monoatomic.modes.filter((mode) => mode.kind === 'translation').length, 3);
  assert.equal(MOLECULES.diatomic.modes.filter((mode) => mode.kind === 'rotation').length, 2);
  assert.equal(MOLECULES['linear-triatomic'].modes.some((mode) => mode.id === 'bend-degenerate'), true);
});

test('diatomic presets reproduce f = 5 and f = 7', () => {
  assert.equal(summarizeModes('diatomic', getPresetModeIds('diatomic', 'rigid')).equipartitionF, 5);
  const result = summarizeModes('diatomic', getPresetModeIds('diatomic', 'vibration'));
  assert.equal(result.visibleCount, 6);
  assert.equal(result.equipartitionF, 7);
});

test('linear triatomic rigid model has 3 translations and 2 rotations only', () => {
  assert.deepEqual(summarizeModes('linear-triatomic', getPresetModeIds('linear-triatomic', 'rigid')).parts, [
    { kind: 'translation', visible: 3, equipartition: 3 },
    { kind: 'rotation', visible: 2, equipartition: 2 },
  ]);
});

test('all preset coordinates are finite', () => {
  for (const id of Object.keys(MOLECULES)) {
    const positions = getAtomPositions(id, getPresetModeIds(id, 'vibration'), 1.25);
    assert.ok(positions.length >= 1);
    assert.ok(positions.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)));
  }
});
```

- [ ] **Step 2: Run the test and observe the expected absent-module failure**

Run: `node --test tests/molecular-degrees-of-freedom.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `molecular-degrees-of-freedom.js`.

- [ ] **Step 3: Implement deterministic molecule and mode data**

Create `molecular-degrees-of-freedom.js` with this data contract and functions:

```js
const translations = [['tx', '沿 x 平移', [1, 0, 0]], ['ty', '沿 y 平移', [0, 1, 0]], ['tz', '沿 z 平移', [0, 0, 1]]]
  .map(([id, label, axis]) => ({ id, label, axis, kind: 'translation', visible: 1, equipartition: 1 }));
const mode = (id, label, kind, visible, equipartition, description, axis = null) => ({ id, label, kind, visible, equipartition, description, axis });

export const MOLECULES = {
  monoatomic: { label: '單原子', atoms: [{ element: 'Ne', base: [0, 0, 0] }], modes: translations },
  diatomic: { label: '雙原子', atoms: [{ element: 'A', base: [-.95, 0, 0] }, { element: 'B', base: [.95, 0, 0] }], modes: [...translations,
    mode('ry', '繞 y 軸轉動', 'rotation', 1, 1, '分子軸在 x 方向，繞 y 軸的方向可獨立指定。', [0, 1, 0]),
    mode('rz', '繞 z 軸轉動', 'rotation', 1, 1, '分子軸在 x 方向，繞 z 軸的方向可獨立指定。', [0, 0, 1]),
    mode('stretch', '鍵長伸縮振動', 'vibration', 1, 2, '同一正規模態有動能與位能兩個二次項。'),
  ] },
  'linear-triatomic': { label: '線型三原子', atoms: [{ element: 'O', base: [-1.25, 0, 0] }, { element: 'C', base: [0, 0, 0] }, { element: 'O', base: [1.25, 0, 0] }], modes: [...translations,
    mode('ry', '繞 y 軸轉動', 'rotation', 1, 1, '線型分子的剛體轉動。', [0, 1, 0]),
    mode('rz', '繞 z 軸轉動', 'rotation', 1, 1, '線型分子的剛體轉動。', [0, 0, 1]),
    mode('symmetric-stretch', '對稱伸縮', 'vibration', 1, 2, '兩端原子相對中心原子同步伸縮。'),
    mode('antisymmetric-stretch', '非對稱伸縮', 'vibration', 1, 2, '兩端原子反向改變鍵長。'),
    mode('bend-degenerate', '彎曲振動（雙重退化）', 'vibration', 2, 4, '可沿 y 和 z 的兩個獨立方向彎曲。'),
  ] },
};

export function getPresetModeIds(moleculeId, preset) {
  const modes = MOLECULES[moleculeId].modes;
  return modes.filter((item) => preset === 'translation' ? item.kind === 'translation' : preset === 'rigid' ? item.kind !== 'vibration' : true).map((item) => item.id);
}

export function summarizeModes(moleculeId, enabledIds) {
  const enabledModes = MOLECULES[moleculeId].modes.filter((item) => enabledIds.includes(item.id));
  const parts = ['translation', 'rotation', 'vibration'].map((kind) => ({ kind, visible: enabledModes.filter((item) => item.kind === kind).reduce((n, item) => n + item.visible, 0), equipartition: enabledModes.filter((item) => item.kind === kind).reduce((n, item) => n + item.equipartition, 0) })).filter((item) => item.visible > 0);
  return { visibleCount: parts.reduce((n, item) => n + item.visible, 0), equipartitionF: parts.reduce((n, item) => n + item.equipartition, 0), parts, enabledModes };
}
```

Complete `getAtomPositions` using sinusoidal translation vectors, Rodrigues rotations about y and z, and documented stretch/bend displacements. Preserve `element`, return finite numbers, and use no random values.

- [ ] **Step 4: Run focused tests and confirm all four pass**

Run: `node --test tests/molecular-degrees-of-freedom.test.mjs`

Expected: PASS with four subtests.

- [ ] **Step 5: Commit the verified model**

Run:

```bash
git add molecular-degrees-of-freedom.js tests/molecular-degrees-of-freedom.test.mjs
git commit -m "feat: add molecular degrees model"
```

### Task 2: 建置互動頁面與 Canvas 動畫

**Files:**
- Create: `molecular-degrees-of-freedom.html`
- Modify: `tests/molecular-degrees-of-freedom.test.mjs`

**Interfaces:**
- Consumes all four exports of Task 1.
- Produces an offline page whose checkbox changes synchronize `enabledModeIds`, `summarizeModes`, the explanation, and the Canvas drawing.

- [ ] **Step 1: Add a failing HTML structure test**

Append this test:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('page has required accessible interactive controls', () => {
  const page = fs.readFileSync(path.join(projectRoot, 'molecular-degrees-of-freedom.html'), 'utf8');
  for (const id of ['moleculeSelect', 'presetTranslation', 'presetRigid', 'presetVibration', 'playPause', 'resetSimulation', 'modeList', 'degreesReadout', 'moleculeCanvas']) assert.match(page, new RegExp(`id=["']${id}["']`));
  assert.match(page, /type=["']module["']/);
  assert.match(page, /requestAnimationFrame/);
});
```

- [ ] **Step 2: Run the test and observe the expected missing-page failure**

Run: `node --test tests/molecular-degrees-of-freedom.test.mjs`

Expected: FAIL with `ENOENT` for `molecular-degrees-of-freedom.html`.

- [ ] **Step 3: Implement the page, controller, and drawing pipeline**

Create `molecular-degrees-of-freedom.html` with this semantic structure:

```html
<main class="app">
  <header class="topbar"><div><p class="eyebrow">物理奧林匹亞 · 熱學</p><h1>分子自由度：把運動拆開看</h1></div><a class="home-link" href="./index.html">回到首頁</a></header>
  <section class="control-bar" aria-label="模擬控制"><label>分子模型 <select id="moleculeSelect"></select></label><button id="presetTranslation" type="button">僅平移</button><button id="presetRigid" type="button">剛性分子</button><button id="presetVibration" type="button">加入振動</button><button id="playPause" type="button" aria-pressed="false">暫停</button><button id="resetSimulation" type="button">重設</button></section>
  <section class="layout"><article class="panel visual-panel"><canvas id="moleculeCanvas" width="920" height="560" aria-label="顯示分子平移、轉動與振動的動畫"></canvas><p id="canvasDescription"></p></article><aside class="sidebar"><section class="panel"><h2>可獨立指定的運動</h2><div id="modeList"></div></section><section class="panel"><h2>目前計數</h2><div id="degreesReadout" aria-live="polite"></div></section><section class="panel"><h2>為何這樣計？</h2><p id="modeExplanation" aria-live="polite"></p></section></aside></section>
</main>
```

Use CSS-grid with two columns above `900px` and one column below it, high-contrast focus states, and `prefers-reduced-motion`. Use this module state pipeline:

```js
import { MOLECULES, getPresetModeIds, summarizeModes, getAtomPositions } from './molecular-degrees-of-freedom.js';
let moleculeId = 'diatomic';
let enabledModeIds = getPresetModeIds(moleculeId, 'rigid');
let isPlaying = true;
let startMs = performance.now();
let focusedModeId = null;
function applyPreset(preset) { enabledModeIds = getPresetModeIds(moleculeId, preset); focusedModeId = enabledModeIds.at(-1) ?? null; renderAll(); }
function renderAll() { renderModeList(); renderReadout(summarizeModes(moleculeId, enabledModeIds)); renderExplanation(); }
function frame(nowMs) { drawCanvas(getAtomPositions(moleculeId, enabledModeIds, isPlaying ? (nowMs - startMs) / 1000 : 0)); if (isPlaying) requestAnimationFrame(frame); }
```

`renderReadout` must separately label the mechanical count and thermal f. If `stretch` is enabled, include exactly: `一個伸縮正規模態有動能與位能兩個二次項，因此 f 增加 2。` Monoatomic vibration preset must retain translations and explain the lack of internal coordinate. `drawCanvas` must clear Canvas, draw labelled x/y/z axes, bonds before atoms, a legend, and arrows/arcs/spring marker for active translation/rotation/vibration without DOM mutation per frame.

- [ ] **Step 4: Run focused tests and verify the page test passes**

Run: `node --test tests/molecular-degrees-of-freedom.test.mjs`

Expected: PASS with five subtests.

- [ ] **Step 5: Manually validate animation and accessibility**

Open `molecular-degrees-of-freedom.html` and confirm: single-atom x/y/z controls update arrows and counts; diatomic rigid gives thermal `f = 5`; diatomic vibration visibly stretches the bond and gives thermal `f = 7` with mechanical count 6; linear triatomic lists two rotations, two stretches and double-degenerate bending but no axial rotation; keyboard focus is visible; under 900px no content is clipped.

- [ ] **Step 6: Commit the interactive page**

Run:

```bash
git add molecular-degrees-of-freedom.html tests/molecular-degrees-of-freedom.test.mjs
git commit -m "feat: add molecular degrees simulation"
```

### Task 3: 連結首頁、文件與最終驗證

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Modify: `tests/molecular-degrees-of-freedom.test.mjs`

**Interfaces:**
- Consumes the Task 2 page path.
- Produces identical homepage and README navigation targets.

- [ ] **Step 1: Add a failing entry-point test**

Append:

```js
test('home page and README link to the molecular degrees simulation', () => {
  const home = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(home, /href=["']\.\/molecular-degrees-of-freedom\.html["']/);
  assert.match(home, /分子自由度：把運動拆開看/);
  assert.match(readme, /molecular-degrees-of-freedom\.html/);
});
```

- [ ] **Step 2: Run the test and confirm navigation is currently absent**

Run: `node --test tests/molecular-degrees-of-freedom.test.mjs`

Expected: FAIL at `home page and README link to the molecular degrees simulation`.

- [ ] **Step 3: Add homepage card and documentation link**

In `index.html`, change `6 個主題` to `7 個主題`, add this card inside `.grid`, and add a dark molecular preview through a new `.degrees-preview` CSS class (no binary image):

```html
<a class="card" href="./molecular-degrees-of-freedom.html"><div class="preview degrees-preview" aria-hidden="true"></div><div class="card-body"><div class="tag-row"><span class="tag orange">熱學</span><span class="tag cyan">分子運動</span></div><h3>分子自由度：把運動拆開看</h3><p class="description">逐一開關平移、轉動與振動模式，從可獨立指定的運動理解自由度與能量均分定理。</p><p class="learn"><strong>適合觀察：</strong>單原子 3、雙原子剛性 5，以及一個振動模態如何讓熱容量計數增加 2。</p><span class="open-link">開始模擬 <span class="arrow">→</span></span></div></a>
```

In `README.md`, add `- [分子自由度：把運動拆開看](./molecular-degrees-of-freedom.html)`.

- [ ] **Step 4: Run automated checks and whitespace verification**

Run: `node --test tests/*.test.mjs`

Expected: PASS for string-wave and molecular-degree tests.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Complete browser smoke check and commit**

Open `index.html`, enter through the new card, recheck diatomic rigid and vibration presets, and confirm no browser console error. Then run:

```bash
git add index.html README.md tests/molecular-degrees-of-freedom.test.mjs
git commit -m "feat: link molecular degrees simulation"
```
