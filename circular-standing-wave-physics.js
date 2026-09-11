export const MODES = [
  { id: 'base', label: '基礎模態', nodalDiameters: 0, nodalCircles: 0 },
  { id: 'diameter-2', label: '2 條節徑', nodalDiameters: 2, nodalCircles: 0 },
  { id: 'diameter-3', label: '3 條節徑', nodalDiameters: 3, nodalCircles: 0 },
  { id: 'circle-1', label: '1 條節圓', nodalDiameters: 0, nodalCircles: 1 },
  {
    id: 'mixed-2-1', label: '2 條節徑＋1 條節圓', nodalDiameters: 2, nodalCircles: 1,
  },
];

export function getModeById(id) {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

export function normalizeSpeed(value) {
  const speed = Number(value);
  return [0.5, 1, 1.5].includes(speed) ? speed : 1;
}

export function waveDisplacement(mode, radius, angle, phase) {
  if (!Number.isFinite(radius) || radius < 0 || radius >= 1) return 0;

  const angularFactor = mode.nodalDiameters === 0
    ? 1
    : radius ** mode.nodalDiameters * Math.cos(mode.nodalDiameters * angle);
  const radialFactor = Math.cos((mode.nodalCircles + 0.5) * Math.PI * radius);

  return angularFactor * radialFactor * Math.cos(phase);
}

export function modeSummary(mode) {
  const nodalFeatures = [
    mode.nodalDiameters && `${mode.nodalDiameters} 條節徑`,
    mode.nodalCircles && `${mode.nodalCircles} 條節圓`,
  ].filter(Boolean);

  return nodalFeatures.length > 0
    ? `此模態有 ${nodalFeatures.join('與')}；線上的位置始終靜止。`
    : '除了固定邊界外，圓盤中央區域會一起上下振動。';
}
