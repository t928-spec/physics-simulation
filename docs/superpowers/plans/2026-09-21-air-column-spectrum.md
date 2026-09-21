# 聲音偵探：空氣柱與弦振動頻譜頁面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可離線與 GitHub Pages 播放的「聲音偵探」活動頁，讓學生在不先知道樂器身分的情況下，依序聽音、讀頻譜、配對模型並最後揭曉。

**Architecture:** 頁面採原生 HTML、CSS 與 ES module。純頻譜峰值及揭露狀態邏輯置於 `air-column-spectrum-physics.js` 以供 Node 測試；`air-column-spectrum.js` 只處理 DOM、Web Audio API 與 Canvas。

**Tech Stack:** 靜態 HTML、ES modules、Web Audio API、Canvas 2D、Node.js `node:test` / `node:assert`。

## Global Constraints

- 初始畫面不得出現單簧管、直笛、吉他、開管、閉管或弦等答案性字詞。
- 音檔必須放入 `assets/air-column-spectrum/`，採 CC0 並保留來源資訊。
- 使用者按播放後才建立音訊分析；不可自動播放或傳出資料。
- A、B、C 必須各自維護 `listen → spectrum → models → answer → extension` 狀態。
- 時域包絡與持續供能只能出現在最後的 extension 階段。
- 窄螢幕採單欄，不可讓播放器、Canvas 或按鈕溢出。

---

## File Structure

- `assets/air-column-spectrum/sample-a.wav`、`sample-b.wav`、`sample-c.wav`：三段實錄 CC0 單音。
- `assets/air-column-spectrum/CREDITS.md`：原始來源、錄音者、授權與裁切說明。
- `air-column-spectrum-physics.js`：峰值和揭露狀態函式。
- `air-column-spectrum.js`：播放器、Canvas 與逐步揭露控制器。
- `air-column-spectrum.html`：活動頁。
- `tests/air-column-spectrum-physics.test.mjs`：純函式測試。
- `tests/air-column-spectrum-page.test.mjs`：HTML、首頁與素材結構測試。
- `index.html`、`README.md`：活動入口與文件。

### Task 1: 建立可測試的頻譜與揭露核心

**Files:**
- Create: `air-column-spectrum-physics.js`
- Create: `tests/air-column-spectrum-physics.test.mjs`

**Interfaces:**
- Produces: `REVEAL_STAGES`, `findProminentPeaks(magnitudes, threshold)`, `estimateFundamentalHz(peaksHz)`, `classifyPeakSpacing(peaksHz, fundamentalHz)`, `nextRevealStage(stage)`。
- Consumes: 數值陣列；不依賴 DOM 或 Web Audio API。

- [ ] **Step 1: 寫失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_STAGES, findProminentPeaks, estimateFundamentalHz,
  classifyPeakSpacing, nextRevealStage,
} from '../air-column-spectrum-physics.js';

test('peaks are local maxima above threshold', () => {
  assert.deepEqual(findProminentPeaks([0, 4, 1, 8, 2, 3, 0], 0.4), [1, 3]);
});
test('fundamental uses shared harmonic spacing', () => {
  assert.equal(estimateFundamentalHz([220, 660, 1100]), 220);
  assert.equal(estimateFundamentalHz([262, 524, 786, 1048]), 262);
});
test('descriptive spacing never names an instrument', () => {
  assert.equal(classifyPeakSpacing([220, 660, 1100], 220), '奇次倍數較突出');
  assert.equal(classifyPeakSpacing([262, 524, 786], 262), '整數倍規律明顯');
});
test('reveal stages stop at extension', () => {
  assert.deepEqual(REVEAL_STAGES, ['listen', 'spectrum', 'models', 'answer', 'extension']);
  assert.equal(nextRevealStage('listen'), 'spectrum');
  assert.equal(nextRevealStage('extension'), 'extension');
});
```

- [ ] **Step 2: 確認失敗**

Run: `node --test tests/air-column-spectrum-physics.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `air-column-spectrum-physics.js`.

- [ ] **Step 3: 實作核心**

```js
export const REVEAL_STAGES = ['listen', 'spectrum', 'models', 'answer', 'extension'];

export function findProminentPeaks(magnitudes, threshold = 0.28) {
  const floor = Math.max(...magnitudes, 0) * threshold;
  return magnitudes.flatMap((value, index) => (
    index > 0 && index < magnitudes.length - 1
      && value >= floor && value > magnitudes[index - 1] && value >= magnitudes[index + 1]
      ? [index] : []
  ));
}
export function estimateFundamentalHz(peaksHz) {
  if (!peaksHz.length) return null;
  return Math.round([...peaksHz].sort((a, b) => a - b).reduce((best, candidate) => {
    const score = peaksHz.filter((peak) => {
      const multiple = Math.round(peak / candidate);
      return multiple >= 1 && Math.abs(peak / candidate - multiple) < 0.09;
    }).length;
    const bestScore = peaksHz.filter((peak) => {
      const multiple = Math.round(peak / best);
      return multiple >= 1 && Math.abs(peak / best - multiple) < 0.09;
    }).length;
    return score > bestScore ? candidate : best;
  }));
}
export function classifyPeakSpacing(peaksHz, fundamentalHz) {
  if (!fundamentalHz || peaksHz.length < 2) return '需要更多峰值';
  return peaksHz.map((peak) => Math.round(peak / fundamentalHz)).every((n) => n % 2 === 1)
    ? '奇次倍數較突出' : '整數倍規律明顯';
}
export function nextRevealStage(stage) {
  const index = Math.max(0, REVEAL_STAGES.indexOf(stage));
  return REVEAL_STAGES[Math.min(index + 1, REVEAL_STAGES.length - 1)];
}
```

- [ ] **Step 4: 確認通過**

Run: `node --test tests/air-column-spectrum-physics.test.mjs`

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum-physics.js tests/air-column-spectrum-physics.test.mjs
git commit -m "feat: add spectrum activity analysis core"
```

### Task 2: 納入可離線播放的授權素材

**Files:**
- Create: `assets/air-column-spectrum/sample-a.wav`
- Create: `assets/air-column-spectrum/sample-b.wav`
- Create: `assets/air-column-spectrum/sample-c.wav`
- Create: `assets/air-column-spectrum/CREDITS.md`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Produces: 三個固定且不含答案名的相對路徑；長度 3–8 秒、單一明顯音高。
- Consumes: FreePats Clarinet、Wooden Recorder、Spanish classical guitar 的 CC0 單音樣本。

- [ ] **Step 1: 寫素材失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

for (const file of ['sample-a.wav', 'sample-b.wav', 'sample-c.wav']) {
  test(`${file} is a non-empty bundled asset`, () => {
    const path = new URL(`../assets/air-column-spectrum/${file}`, import.meta.url);
    assert.equal(existsSync(path), true);
    assert.ok(statSync(path).size > 4096);
  });
}
test('credits preserve source and CC0 information', () => {
  const text = readFileSync(new URL('../assets/air-column-spectrum/CREDITS.md', import.meta.url), 'utf8');
  assert.match(text, /FreePats/);
  assert.match(text, /CC0 1\.0/);
  assert.match(text, /Clarinet/);
  assert.match(text, /Recorder/);
  assert.match(text, /Spanish classical guitar/);
});
```

- [ ] **Step 2: 確認失敗**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because `sample-a.wav` does not exist.

- [ ] **Step 3: 下載、挑選與輸出素材**

從官方頁取得 CC0 樣本庫，選出起音後至少 2 秒音高穩定、無和弦或旋律的單音。只可移除首尾靜音與加入 30 ms 淡入淡出，不可改變音高；以 WAV 44.1 kHz 輸出至固定名稱。CREDITS 必須記錄原始檔名、錄音者、來源、CC0 連結與處理方式。

```text
https://freepats.zenvoid.org/Reed/clarinet.html
https://freepats.zenvoid.org/Wind/recorder.html
https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
https://creativecommons.org/publicdomain/zero/1.0/
```

- [ ] **Step 4: 確認素材測試通過**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: asset and credit assertions PASS; page assertions may still fail.

- [ ] **Step 5: Commit**

```bash
git add assets/air-column-spectrum tests/air-column-spectrum-page.test.mjs
git commit -m "feat: add licensed sound detective samples"
```

### Task 3: 製作匿名樣本、即時頻譜與五階段揭露

**Files:**
- Create: `air-column-spectrum.html`
- Create: `air-column-spectrum.js`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Consumes: Task 1 exports與 Task 2 的三段 WAV。
- Produces: `.sample-card[data-stage]`、原生 audio、Canvas、峰值摘要、下一步按鈕；三卡獨立狀態。

- [ ] **Step 1: 寫頁面失敗測試**

```js
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');

test('page exposes three anonymous audios and accessible live canvases', () => {
  for (const id of ['sample-a', 'sample-b', 'sample-c']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-a\.wav"/);
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-b\.wav"/);
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-c\.wav"/);
  assert.match(page, /aria-label="樣本 A 的即時頻譜"/);
  assert.match(page, /<script type="module" src="\.\/air-column-spectrum\.js"><\/script>/);
});
test('listen stage has no answer words', () => {
  const listen = page.match(/<section id="listening"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(listen, /單簧管|直笛|吉他|開管|閉管|弦/);
  assert.match(page, /data-stage="listen"/);
  assert.match(page, /data-stage="extension"/);
});
test('page includes fallback and credits', () => {
  assert.match(page, /瀏覽器無法啟用即時頻譜/);
  assert.match(page, /FreePats/);
  assert.match(page, /CC0 1\.0/);
});
```

- [ ] **Step 2: 確認失敗**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL with `ENOENT` for `air-column-spectrum.html`.

- [ ] **Step 3: 實作 HTML 與控制器**

每張卡只以 A、B、C 命名；答案段落在 `answer` 前保持 `hidden`。以這個結構建立 A，並以 B、C 替換 id、字母和檔名：

```html
<article class="sample-card" data-sample="a" data-stage="listen">
  <h2>樣本 A</h2>
  <audio id="sample-a" controls preload="metadata" src="./assets/air-column-spectrum/sample-a.wav"></audio>
  <section class="stage spectrum-stage" hidden>
    <canvas class="spectrum-canvas" width="720" height="300" aria-label="樣本 A 的即時頻譜">此瀏覽器無法繪製 Canvas。</canvas>
    <p class="peak-summary" aria-live="polite">播放後會顯示主要頻率峰值。</p>
  </section>
  <section class="stage models-stage" hidden>三張匿名諧波規律卡</section>
  <section class="stage answer-stage" hidden>實際樂器、近似模型與非理想原因</section>
  <section class="stage extension-stage" hidden>時域包絡、能量輸入與拉弓弦反例</section>
  <button class="next-step" type="button">顯示下一步</button>
</article>
```

控制器對每一個 audio 建立獨立 `AudioContext`、`createMediaElementSource(audio)`、`createAnalyser()`，設定 `fftSize = 4096` 與 `smoothingTimeConstant = 0.72`。在 `play` 時以 `requestAnimationFrame` 呼叫 `getByteFrequencyData`，從 `sampleRate / analyser.fftSize` 算出 Hz；在 `pause` 與 `ended` 時取消該卡 frame。分析失敗時仍保留播放器和揭露按鈕，顯示「瀏覽器無法啟用即時頻譜；仍可依聽覺與後續模型進行活動。」。

- [ ] **Step 4: 確認頁面與核心測試通過**

Run: `node --test tests/air-column-spectrum-physics.test.mjs tests/air-column-spectrum-page.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add air-column-spectrum.html air-column-spectrum.js tests/air-column-spectrum-page.test.mjs
git commit -m "feat: add progressive spectrum detective activity"
```

### Task 4: 接入首頁、文件與視覺驗證

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Modify: `tests/air-column-spectrum-page.test.mjs`

**Interfaces:**
- Produces: 首頁活動卡、README 相對連結和正確的 10 個主題計數。

- [ ] **Step 1: 寫首頁失敗測試**

```js
test('home and README link to the activity', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(home, /10 個主題/);
  assert.match(home, /href="\.\/air-column-spectrum\.html"/);
  assert.match(home, /聲音偵探：從頻譜推論振動系統/);
  assert.match(readme, /\[聲音偵探：從頻譜推論振動系統\]\(\.\/air-column-spectrum\.html\)/);
});
```

- [ ] **Step 2: 確認失敗**

Run: `node --test tests/air-column-spectrum-page.test.mjs`

Expected: FAIL because homepage still shows `9 個主題`.

- [ ] **Step 3: 實作入口**

在首頁波動區新增 `href="./air-column-spectrum.html"` 卡片，標題使用「聲音偵探：從頻譜推論振動系統」，描述不列出三件樂器；將首頁的「九個」與「9 個主題」改為「十個」與「10 個主題」。在 README 加入：

```markdown
- [聲音偵探：從頻譜推論振動系統](./air-column-spectrum.html)
```

- [ ] **Step 4: 執行完整回歸測試**

Run: `node --test tests/*.test.mjs`

Expected: all existing and new tests PASS.

- [ ] **Step 5: 本機視覺檢查並提交**

Run: `python -m http.server 8000 --directory .`

Expected: `/index.html` 與 `/air-column-spectrum.html` 回傳 HTTP 200。逐卡確認初始不暴雷、Canvas 隨播放更新、四次揭露依序出現頻譜／匿名模型／答案／延伸，並在 390 px 寬度確認單欄無溢出。

```bash
git add index.html README.md tests/air-column-spectrum-page.test.mjs
git commit -m "feat: link sound detective activity from home"
```

## Self-Review

- Spec coverage: Task 1 處理非答案式讀圖輔助與獨立階段；Task 2 處理本機 CC0 音檔與來源；Task 3 處理五階段、Canvas 與降級；Task 4 處理首頁、README、桌面與平板驗證。
- Placeholder scan: 每一項都有檔案、命令、預期測試結果與實作界面；沒有延後決策。
- Type consistency: 所有測試與控制器使用相同的五個 exported 函式及 `REVEAL_STAGES` 名稱。

