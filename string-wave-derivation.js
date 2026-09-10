import { calculateBoundary, sanitizeDensities } from './string-wave-physics.js';

const tension = 100;
const params = new URLSearchParams(location.search);
const densities = sanitizeDensities(
  Number(params.get('muLeft')),
  Number(params.get('muRight')),
);
const result = calculateBoundary(densities.muLeft, densities.muRight, tension);
const percent = (value) => `${(value * 100).toFixed(1)}%`;

document.querySelector('[data-value="muLeft"]').textContent = `μ₁ = ${densities.muLeft.toFixed(2)}`;
document.querySelector('[data-value="muRight"]').textContent = `μ₂ = ${densities.muRight.toFixed(2)}`;
document.querySelector('[data-example="speed"]').textContent =
  `代入 T = ${tension}：v₁ = ${result.vLeft.toFixed(2)}，v₂ = ${result.vRight.toFixed(2)}。`;
document.querySelector('[data-example="amplitude"]').textContent =
  `本例 r = ${result.amplitudeReflection.toFixed(3)}，t = ${result.amplitudeTransmission.toFixed(3)}。`;
document.querySelector('[data-example="energy"]').textContent =
  `反射能量 R = ${percent(result.energyReflection)}；透射能量 τ = ${percent(result.energyTransmission)}；合計 100.0%。`;
document.querySelector('[data-example="phase"]').textContent =
  result.amplitudeReflection < 0
    ? '這是輕繩傳到重繩的情況：反射波反相，波峰會反射成波谷。'
    : result.amplitudeReflection > 0
      ? '這是重繩傳到輕繩的情況：反射波同相，波峰仍是波峰。'
      : '兩條繩的線密度相同：沒有反射波。';
document.querySelector('#backToSimulation').href =
  `./string-wave-boundary.html?muLeft=${densities.muLeft}&muRight=${densities.muRight}`;
