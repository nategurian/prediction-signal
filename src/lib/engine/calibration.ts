/**
 * Forecast-error calibration math.
 *
 * Takes raw (actual_high, forecasted_high) observations and returns
 * the statistics we persist per city. Kept pure / side-effect-free so it can
 * be unit-tested without a database.
 */

export interface ForecastErrorSample {
  actual: number;
  forecast: number;
  /** Optional, used for `last_sample_at` and future time-weighting. */
  observed_at?: string | null;
}

export interface ForecastErrorStats {
  /** Population stdev of signed error. */
  stdev: number;
  /** sqrt(mean(error^2)). Equals stdev if mean error is 0; larger otherwise. */
  rmse: number;
  /** Mean of |error|. Useful alongside rmse to detect heavy tails. */
  mae: number;
  /** Signed mean error: positive => forecast runs cold. */
  mean: number;
  sample_count: number;
  /** Most recent observed_at across the input samples (ISO string). */
  last_sample_at: string | null;
}

/**
 * Compute the forecast-error statistics used to drive dynamic sigma.
 *
 * - Uses population stdev (N, not N-1) to be slightly more conservative for small samples.
 * - Drops samples where either actual or forecast is non-finite.
 * - Returns `sample_count === 0` with zeroed fields when nothing is usable; callers
 *   should treat that as "no calibration available" and fall back.
 */
export function computeForecastErrorStats(
  samples: readonly ForecastErrorSample[]
): ForecastErrorStats {
  const errors: number[] = [];
  let latestIso: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const s of samples) {
    if (!Number.isFinite(s.actual) || !Number.isFinite(s.forecast)) continue;
    errors.push(s.actual - s.forecast);
    if (s.observed_at) {
      const t = Date.parse(s.observed_at);
      if (Number.isFinite(t) && t > latestMs) {
        latestMs = t;
        latestIso = s.observed_at;
      }
    }
  }

  const n = errors.length;
  if (n === 0) {
    return { stdev: 0, rmse: 0, mae: 0, mean: 0, sample_count: 0, last_sample_at: null };
  }

  const sum = errors.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sumSq = errors.reduce((a, e) => a + e * e, 0);
  const meanSq = sumSq / n;
  const rmse = Math.sqrt(meanSq);
  const variance = meanSq - mean * mean;
  const stdev = Math.sqrt(Math.max(variance, 0));
  const mae = errors.reduce((a, e) => a + Math.abs(e), 0) / n;

  return { stdev, rmse, mae, mean, sample_count: n, last_sample_at: latestIso };
}

/**
 * Resolve the effective sigma for probability calculations, applying the
 * priority chain:
 *   1. empirical calibration σ (when sample_count >= minSamples)
 *   2. ensemble σ (when provided)
 *   3. static fallback σ
 * Result is clamped to [floor, ceiling].
 *
 * RMSE is preferred over stdev because it includes bias: if our forecasts run
 * systematically cold/hot, the extra term makes the distribution appropriately
 * wider rather than letting mean-zero-assumed stdev hide the miscalibration.
 */
export interface ResolveSigmaParams {
  calibration: {
    forecast_error_stdev: number;
    forecast_error_rmse: number;
    sample_count: number;
  } | null;
  ensembleSigma: number | null;
  staticSigma: number;
  minCalibrationSamples: number;
  sigmaFloor: number;
  sigmaCeiling: number;
}

export type SigmaSource = "calibration" | "ensemble" | "static_fallback";

export interface ResolvedSigma {
  sigma: number;
  /** Raw value before floor/ceiling clamp, useful for debugging. */
  rawSigma: number;
  source: SigmaSource;
  clamped: boolean;
}

export function resolveEffectiveSigma(params: ResolveSigmaParams): ResolvedSigma {
  const {
    calibration,
    ensembleSigma,
    staticSigma,
    minCalibrationSamples,
    sigmaFloor,
    sigmaCeiling,
  } = params;

  let raw: number;
  let source: SigmaSource;

  if (
    calibration != null &&
    calibration.sample_count >= minCalibrationSamples &&
    Number.isFinite(calibration.forecast_error_rmse) &&
    calibration.forecast_error_rmse > 0
  ) {
    raw = calibration.forecast_error_rmse;
    source = "calibration";
  } else if (
    ensembleSigma != null &&
    Number.isFinite(ensembleSigma) &&
    ensembleSigma > 0
  ) {
    raw = ensembleSigma;
    source = "ensemble";
  } else {
    raw = staticSigma;
    source = "static_fallback";
  }

  const clamped = Math.max(sigmaFloor, Math.min(sigmaCeiling, raw));
  return { sigma: clamped, rawSigma: raw, source, clamped: clamped !== raw };
}
