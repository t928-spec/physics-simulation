export const DEFAULT_STATE = Object.freeze({
  phase: 0,
  playing: true,
  speed: 1,
  probeX: 360,
  layers: Object.freeze({
    waveform: true,
    displacement: true,
    pressure: true,
    probe: true,
    guides: true,
  }),
});

export function advanceState(state, elapsedSeconds) {
  const elapsed = Number.isFinite(Number(elapsedSeconds))
    ? Math.max(0, Number(elapsedSeconds))
    : 0;

  return state.playing
    ? { ...state, phase: state.phase + elapsed * state.speed }
    : state;
}

export function setProbe(state, x, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const candidate = Number.isFinite(Number(x)) ? Number(x) : state.probeX;

  return { ...state, probeX: Math.min(safeWidth, Math.max(0, candidate)) };
}

export function toggleLayer(state, name, visible) {
  return { ...state, layers: { ...state.layers, [name]: Boolean(visible) } };
}

export function togglePlaying(state) {
  return { ...state, playing: !state.playing };
}

export function resetState() {
  return { ...DEFAULT_STATE, layers: { ...DEFAULT_STATE.layers } };
}
