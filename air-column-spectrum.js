import {
  SPECTRUM_AXIS_MAX_HZ,
  SPECTRUM_AXIS_TICK_HZ,
  averageSpectrumFrames,
  classifyPeakSpacing,
  estimateFundamentalHz,
  findProminentPeaks,
  nextRevealStage,
} from './air-column-spectrum-physics.js';

const prompts = {
  listen: '先完整聽一次，記下你想檢查的聲音特徵。',
  spectrum: '播放到音量較穩定的一段，找出峰值並提出基音候選。',
  models: '把觀察到的峰值排列，和三張匿名規律卡配對。',
  answer: '現在檢查你的模型配對，並找出真實系統偏離理想模型的地方。',
  extension: '把時間變化當作延伸線索：它不是本活動的主要判準。',
};

function drawSpectrum(canvas, values, hertzPerBin) {
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
  for (let hertz = 0; hertz <= SPECTRUM_AXIS_MAX_HZ; hertz += SPECTRUM_AXIS_TICK_HZ) {
    const x = plot.left + (hertz / SPECTRUM_AXIS_MAX_HZ) * plotWidth;
    context.strokeStyle = 'rgba(255,255,255,.22)';
    context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, baseline); context.stroke();
    context.fillText(String(hertz), x, height - 20);
  }
  context.fillText('頻率（Hz）', plot.left + plotWidth / 2, height - 5);
  const visible = Math.min(values.length, Math.floor(SPECTRUM_AXIS_MAX_HZ / hertzPerBin) + 1);
  const barWidth = plotWidth / visible;
  for (let index = 0; index < visible; index += 1) {
    const barHeight = (values[index] / 255) * plotHeight;
    context.fillStyle = index % 2 ? '#6bd8dc' : '#78a8ff';
    context.fillRect(plot.left + index * barWidth, baseline - barHeight, Math.max(1, barWidth), barHeight);
  }
  context.textAlign = 'start';
}

function describePeaks(values, hertzPerBin) {
  const peakIndexes = findProminentPeaks(values, 0.30).slice(0, 8);
  const peaksHz = peakIndexes.map((index) => Math.round(index * hertzPerBin));
  const fundamentalHz = estimateFundamentalHz(peaksHz);
  return fundamentalHz
    ? `主要峰值：約 ${peaksHz.join('、')} Hz；基音候選：約 ${fundamentalHz} Hz；${classifyPeakSpacing(peaksHz, fundamentalHz)}。`
    : '請播放到音量穩定的一段，再觀察峰值。';
}

function setupCard(card) {
  const audio = card.querySelector('audio');
  const canvas = card.querySelector('canvas');
  const spectrumStage = card.querySelector('.spectrum-stage');
  const modelsStage = card.querySelector('.models-stage');
  const answerStage = card.querySelector('.answer-stage');
  const extensionStage = card.querySelector('.extension-stage');
  const summary = card.querySelector('.peak-summary');
  const prompt = card.querySelector('.stage-prompt');
  const button = card.querySelector('.next-step');
  const lockButton = card.querySelector('.spectrum-lock');
  let audioContext;
  let analyser;
  let source;
  let animationFrame;
  let lockState = 'live';
  let captureFrames = [];
  let captureElapsedMs = 0;
  let lastCaptureTimestamp = null;
  let lockedValues = [];

  function updateStage(stage) {
    card.dataset.stage = stage;
    prompt.textContent = prompts[stage];
    spectrumStage.hidden = stage === 'listen';
    modelsStage.hidden = !['models', 'answer', 'extension'].includes(stage);
    answerStage.hidden = !['answer', 'extension'].includes(stage);
    extensionStage.hidden = stage !== 'extension';
    button.textContent = stage === 'extension' ? '已完成揭露' : '顯示下一步';
    button.disabled = stage === 'extension';
  }

  function animate(timestamp) {
    if (!analyser) return;
    const values = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(values);
    const hertzPerBin = audioContext.sampleRate / analyser.fftSize;
    let displayValues = Array.from(values);
    if (lockState === 'capturing') {
      captureFrames.push(displayValues);
      if (lastCaptureTimestamp !== null) captureElapsedMs += timestamp - lastCaptureTimestamp;
      lastCaptureTimestamp = timestamp;
      if (captureElapsedMs >= 1000) {
        lockedValues = averageSpectrumFrames(captureFrames);
        lockState = 'locked';
        lockButton.disabled = false;
        lockButton.textContent = '恢復即時頻譜';
        displayValues = lockedValues;
        summary.textContent = describePeaks(displayValues, hertzPerBin);
      } else {
        summary.textContent = `正在累積平均頻譜：${Math.min(100, Math.round(captureElapsedMs / 10))}%`;
      }
    } else if (lockState === 'locked') {
      displayValues = lockedValues;
      summary.textContent = describePeaks(displayValues, hertzPerBin);
    } else {
      summary.textContent = describePeaks(displayValues, hertzPerBin);
    }
    drawSpectrum(canvas, displayValues, hertzPerBin);
    animationFrame = requestAnimationFrame(animate);
  }

  function startCapture() {
    lockState = 'capturing';
    captureFrames = [];
    captureElapsedMs = 0;
    lastCaptureTimestamp = null;
    lockedValues = [];
    lockButton.disabled = true;
    lockButton.textContent = '正在平均…';
    summary.textContent = '請持續播放約 1 秒，正在累積平均頻譜。';
  }

  function restoreLiveSpectrum() {
    lockState = 'live';
    captureFrames = [];
    captureElapsedMs = 0;
    lastCaptureTimestamp = null;
    lockedValues = [];
    lockButton.textContent = '鎖定 1 秒平均';
  }

  async function initialiseAudio() {
    if (analyser) return true;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('AudioContext unavailable');
      audioContext = new Context();
      source = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      return true;
    } catch (error) {
      document.querySelector('#audioFallback').hidden = false;
      return false;
    }
  }

  audio.addEventListener('play', async () => {
    if (!await initialiseAudio()) return;
    await audioContext.resume();
    if (lockState === 'capturing') lastCaptureTimestamp = null;
    cancelAnimationFrame(animationFrame);
    animate();
  });
  audio.addEventListener('pause', () => {
    cancelAnimationFrame(animationFrame);
    if (lockState === 'capturing') {
      lastCaptureTimestamp = null;
      summary.textContent = '平均尚未完成；繼續播放即可接著累積。';
    }
  });
  audio.addEventListener('ended', () => {
    cancelAnimationFrame(animationFrame);
    if (lockState === 'capturing') {
      lastCaptureTimestamp = null;
      summary.textContent = '平均尚未完成；重新播放可接著累積。';
    }
  });
  lockButton.addEventListener('click', () => {
    if (lockState === 'locked') restoreLiveSpectrum();
    else if (lockState === 'live') startCapture();
  });
  button.addEventListener('click', () => updateStage(nextRevealStage(card.dataset.stage)));
  updateStage('listen');
}

document.querySelectorAll('.sample-card').forEach(setupCard);
