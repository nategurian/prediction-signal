/**
 * Error function approximation using Abramowitz and Stegun formula 7.1.26.
 * Maximum error: 1.5e-7
 */
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const a = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * a);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-a * a);

  return sign * y;
}

/**
 * Standard normal CDF: P(X <= x) for X ~ N(0, 1)
 */
export function standardNormalCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

/**
 * Normal CDF: P(X <= x) for X ~ N(mu, sigma)
 */
export function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) throw new Error("sigma must be positive");
  return standardNormalCdf((x - mu) / sigma);
}

/**
 * Normal PDF: f(x) for X ~ N(mu, sigma)
 */
export function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) throw new Error("sigma must be positive");
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/**
 * Clamp value to [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
