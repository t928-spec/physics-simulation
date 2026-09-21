import {
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

function drawSpectrum(canvas, values) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#10233d';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(255,255,255,.18)';
  context.lineWidth = 1;
  for (let row = 1; row < 4; row += 1) {
    const y = (height * row) / 4;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  const visible = Math.min(values.length, 520);
  const barWidth = width / visible;
  for (let index = 0; index < visible; index += 1) {
    const barHeight = (values[index] / 255) * (height - 22);
    context.fillStyle = index % 2 ? '#6bd8dc' : '#78a8ff';
    context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth), barHeight);
  }
  context.fillStyle = 'rgba(255,255,255,.8)';
  context.font = '14px Arial';
  context.fillText('頻率 →', width - 60, height - 8);
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
  let audioContext;
  let analyser;
  let source;
  let animationFrame;

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

  function animate() {
    if (!analyser) return;
    const values = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(values);
    drawSpectrum(canvas, values);
    const peakIndexes = findProminentPeaks([...values], 0.30).slice(0, 8);
    const hertzPerBin = audioContext.sampleRate / analyser.fftSize;
    const peaksHz = peakIndexes.map((index) => Math.round(index * hertzPerBin));
    const fundamentalHz = estimateFundamentalHz(peaksHz);
    summary.textContent = fundamentalHz
      ? `主要峰值：約 ${peaksHz.join('、')} Hz；基音候選：約 ${fundamentalHz} Hz；${classifyPeakSpacing(peaksHz, fundamentalHz)}。`
      : '請播放到音量穩定的一段，再觀察峰值。';
    animationFrame = requestAnimationFrame(animate);
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
    cancelAnimationFrame(animationFrame);
    animate();
  });
  audio.addEventListener('pause', () => cancelAnimationFrame(animationFrame));
  audio.addEventListener('ended', () => cancelAnimationFrame(animationFrame));
  button.addEventListener('click', () => updateStage(nextRevealStage(card.dataset.stage)));
  updateStage('listen');
}

document.querySelectorAll('.sample-card').forEach(setupCard);
