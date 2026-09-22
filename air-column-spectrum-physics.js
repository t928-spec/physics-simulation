export const REVEAL_STAGES = ['listen', 'spectrum', 'models', 'answer', 'extension'];
export const SPECTRUM_AXIS_MAX_HZ = 1800;
export const SPECTRUM_AXIS_TICK_HZ = 300;

export function averageSpectrumFrames(frames) {
  if (!frames.length) return [];
  return frames[0].map((_, index) => Math.round(
    frames.reduce((sum, frame) => sum + frame[index], 0) / frames.length,
  ));
}

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
  return peaksHz.map((peak) => Math.round(peak / fundamentalHz)).every((multiple) => multiple % 2 === 1)
    ? '奇次倍數較突出'
    : '整數倍規律明顯';
}

export function nextRevealStage(stage) {
  const index = Math.max(0, REVEAL_STAGES.indexOf(stage));
  return REVEAL_STAGES[Math.min(index + 1, REVEAL_STAGES.length - 1)];
}
