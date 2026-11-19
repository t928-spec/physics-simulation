export const radians = degrees => degrees * Math.PI / 180;
export const degrees = radians => radians * 180 / Math.PI;
export const refractedAngle = (angle, index) => degrees(Math.asin(Math.sin(radians(angle)) / index));
export const pinDeviation = (baseline, offset) => degrees(Math.atan2(Math.abs(offset), baseline));
export const imageDistance = (p, f) => p * f / (p - f);
export const focalLength = (p, q) => p * q / (p + q);
export const wavelength = (d, L, dy) => 10000 * d * dy / L;
export const slitWidth = (lambda, L, dy) => lambda * L / (10000 * dy);

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

export function summary(values) {
  if (!values.length) return null;
  const mean = average(values);
  const squared = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return {
    mean,
    uncertainty: values.length < 2 ? null : Math.sqrt(squared / (values.length * (values.length - 1)))
  };
}

export function regression(points) {
  if (points.length < 2) return null;
  const xMean = average(points.map(([x]) => x));
  const yMean = average(points.map(([, y]) => y));
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) {
    xx += (x - xMean) ** 2;
    yy += (y - yMean) ** 2;
    xy += (x - xMean) * (y - yMean);
  }
  if (!xx) return null;
  const slope = xy / xx;
  return { slope, intercept: yMean - slope * xMean, r2: yy ? Math.min(1, xy ** 2 / (xx * yy)) : null };
}
