import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

for (const file of ['sample-a.wav', 'sample-b.mp3', 'sample-c.flac']) {
  test(`${file} is a non-empty bundled audio asset`, () => {
    const path = new URL(`../assets/air-column-spectrum/${file}`, import.meta.url);
    assert.equal(existsSync(path), true);
    assert.ok(statSync(path).size > 4096);
  });
}

for (const file of [
  'sample-a-ideal-closed-pipe.wav',
  'reveals/closed-pipe.png',
  'reveals/recorder.png',
  'reveals/guitar.png',
  'reveals/clarinet.png',
]) {
  test(`${file} is a non-empty model or reveal asset`, () => {
    const path = new URL(`../assets/air-column-spectrum/${file}`, import.meta.url);
    assert.equal(existsSync(path), true);
    assert.ok(statSync(path).size > 4096);
  });
}

test('ideal closed-pipe audio contains the intended odd harmonics and suppresses even harmonics', () => {
  const audio = readFileSync(new URL('../assets/air-column-spectrum/sample-a-ideal-closed-pipe.wav', import.meta.url));
  const sampleRate = audio.readUInt32LE(24);
  const start = sampleRate;
  const count = sampleRate * 4;
  const magnitudeAt = (frequency) => {
    let sine = 0;
    let cosine = 0;
    for (let index = 0; index < count; index += 1) {
      const sample = audio.readInt16LE(44 + (start + index) * 2) / 32768;
      const angle = (2 * Math.PI * frequency * index) / sampleRate;
      sine += sample * Math.sin(angle);
      cosine += sample * Math.cos(angle);
    }
    return (2 * Math.hypot(sine, cosine)) / count;
  };

  assert.ok(magnitudeAt(300) > 0.5);
  assert.ok(magnitudeAt(900) > 0.2);
  assert.ok(magnitudeAt(1500) > 0.1);
  for (const frequency of [600, 1200, 1800]) assert.ok(magnitudeAt(frequency) < 0.001);
});

test('credits preserve source and CC0 information', () => {
  const credits = readFileSync(new URL('../assets/air-column-spectrum/CREDITS.md', import.meta.url), 'utf8');
  assert.match(credits, /FreePats/);
  assert.match(credits, /CC0 1\.0/);
  assert.match(credits, /Clarinet/);
  assert.match(credits, /Alto Recorder D5/);
  assert.match(credits, /sgossner/);
  assert.match(credits, /freesound\.org\/people\/sgossner\/sounds\/242028/);
  assert.match(credits, /Spanish classical guitar/);
});

test('page begins with three anonymous samples and accessible spectrum canvases', () => {
  const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');
  for (const id of ['sample-a', 'sample-b', 'sample-c']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-a-ideal-closed-pipe\.wav"/);
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-b\.mp3"/);
  assert.match(page, /src="\.\/assets\/air-column-spectrum\/sample-c\.flac"/);
  assert.match(page, /aria-label="樣本 A 的即時頻譜"/);
  assert.match(page, /<script type="module" src="\.\/air-column-spectrum\.js"><\/script>/);
});

test('each anonymous sample and the clarinet comparison offer a stable one-second lock and fixed axis', () => {
  const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../air-column-spectrum.js', import.meta.url), 'utf8');
  assert.equal((page.match(/class="spectrum-lock"/g) || []).length, 4);
  assert.match(page, /鎖定 1 秒平均/);
  assert.match(script, /SPECTRUM_AXIS_MAX_HZ/);
  assert.match(script, /SPECTRUM_AXIS_TICK_HZ/);
  assert.match(script, /averageSpectrumFrames/);
});

test('listening stage does not reveal instruments or boundary models', () => {
  const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');
  const listening = page.match(/<section id="listening"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(listening, /單簧管|直笛|吉他|開管|閉管|弦/);
  assert.match(page, /data-stage="listen"/);
  assert.match(page, /class="stage extension-stage"/);
});

test('home page and README link to the activity', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(home, /11 個主題/);
  assert.match(home, /href="\.\/air-column-spectrum\.html"/);
  assert.match(home, /聲音偵探：從頻譜推論振動系統/);
  assert.match(readme, /\[聲音偵探：從頻譜推論振動系統\]\(\.\/air-column-spectrum\.html\)/);
});

test('Fourier extension follows the comparison and connects maths to applications', () => {
  const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');
  const fourierIndex = page.indexOf('id="fourier-extension"');
  const compareIndex = page.indexOf('class="compare"');
  assert.ok(fourierIndex > compareIndex);
  for (const phrase of ['正交', 'aₘ', 'Xₖ', 'DFT', 'FFT', '手機調音器', '等化器', 'MRI']) {
    assert.match(page, new RegExp(phrase));
  }
});

test('ideal closed-pipe model and clarinet comparison are explicitly separated', () => {
  const page = readFileSync(new URL('../air-column-spectrum.html', import.meta.url), 'utf8');
  assert.match(page, /id="sample-a"[^>]*sample-a-ideal-closed-pipe\.wav/);
  assert.match(page, /理想一端閉管模型聲/);
  assert.match(page, /300 Hz.*900 Hz.*1500 Hz/s);
  assert.match(page, /id="clarinet-comparison"/);
  assert.match(page, /id="sample-clarinet-real"[^>]*sample-a\.wav/);
  assert.match(page, /data-start-stage="spectrum"/);
  assert.equal((page.match(/class="reveal-image"/g) || []).length, 4);
});
