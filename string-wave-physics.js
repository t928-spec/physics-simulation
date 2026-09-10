export function calculateBoundary(muLeft, muRight, tension) {
  const vLeft = Math.sqrt(tension / muLeft);
  const vRight = Math.sqrt(tension / muRight);
  const amplitudeReflection = (vRight - vLeft) / (vLeft + vRight);
  const amplitudeTransmission = (2 * vRight) / (vLeft + vRight);
  const energyReflection = amplitudeReflection ** 2;

  return {
    vLeft,
    vRight,
    amplitudeReflection,
    amplitudeTransmission,
    energyReflection,
    energyTransmission: 1 - energyReflection,
  };
}

export function sampleShape(kind, phase) {
  if (kind === 'triangle') {
    const cycle = phase / (2 * Math.PI);
    return 1 - 4 * Math.abs(Math.round(cycle) - cycle);
  }

  return Math.sin(phase);
}

export function pulseSample(kind, distance, width) {
  if (Math.abs(distance) > width) return 0;
  if (kind === 'triangle') return 1 - Math.abs(distance / width);
  return Math.sin((distance / width + 1) * Math.PI);
}

export function createStringState({ muLeft, muRight, tension, pointCount, length }) {
  const dx = length / (pointCount - 1);
  const junctionIndex = Math.floor((pointCount - 1) / 2);
  const masses = Float64Array.from(
    { length: pointCount },
    (_, index) => (index <= junctionIndex ? muLeft : muRight) * dx,
  );
  const maximumSpeed = Math.sqrt(tension / Math.min(muLeft, muRight));

  return {
    y: new Float64Array(pointCount),
    previousY: new Float64Array(pointCount),
    masses,
    dx,
    dt: 0.68 * dx / maximumSpeed,
    junctionIndex,
    time: 0,
  };
}

export function stepStringState(state, tension) {
  const nextY = new Float64Array(state.y.length);

  for (let index = 1; index < state.y.length - 1; index += 1) {
    const curvature = state.y[index + 1] - 2 * state.y[index] + state.y[index - 1];
    const acceleration = tension * curvature / (state.dx * state.masses[index]);
    nextY[index] = 2 * state.y[index] - state.previousY[index] + state.dt ** 2 * acceleration;
  }

  state.previousY = state.y;
  state.y = nextY;
  state.time += state.dt;
  return state;
}
