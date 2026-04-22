import { describe, it, expect } from "vitest";
import {
  computeForecastErrorStats,
  resolveEffectiveSigma,
  resolveForecastBiasCorrection,
} from "../calibration";

describe("computeForecastErrorStats", () => {
  it("returns zeroed stats for empty input", () => {
    const s = computeForecastErrorStats([]);
    expect(s.sample_count).toBe(0);
    expect(s.stdev).toBe(0);
    expect(s.rmse).toBe(0);
    expect(s.last_sample_at).toBeNull();
  });

  it("computes mean, stdev, RMSE, and MAE for a known distribution", () => {
    const s = computeForecastErrorStats([
      { actual: 72, forecast: 70 },
      { actual: 68, forecast: 70 },
      { actual: 74, forecast: 70 },
      { actual: 66, forecast: 70 },
    ]);
    expect(s.sample_count).toBe(4);
    expect(s.mean).toBeCloseTo(0, 5);
    expect(s.mae).toBeCloseTo(3, 5);
    expect(s.stdev).toBeCloseTo(Math.sqrt(10), 5);
    expect(s.rmse).toBeCloseTo(Math.sqrt(10), 5);
  });

  it("RMSE exceeds stdev when mean error is nonzero (bias inflates RMSE)", () => {
    const s = computeForecastErrorStats([
      { actual: 74, forecast: 70 },
      { actual: 73, forecast: 70 },
      { actual: 75, forecast: 70 },
    ]);
    expect(s.mean).toBeCloseTo(4, 5);
    expect(s.rmse).toBeGreaterThan(s.stdev);
  });

  it("drops non-finite samples", () => {
    const s = computeForecastErrorStats([
      { actual: 70, forecast: 70 },
      { actual: Number.NaN, forecast: 70 },
      { actual: 70, forecast: Number.POSITIVE_INFINITY },
      { actual: 72, forecast: 70 },
    ]);
    expect(s.sample_count).toBe(2);
  });

  it("tracks the latest observed_at timestamp across samples", () => {
    const s = computeForecastErrorStats([
      { actual: 70, forecast: 70, observed_at: "2026-04-10T00:00:00Z" },
      { actual: 72, forecast: 70, observed_at: "2026-04-15T00:00:00Z" },
      { actual: 68, forecast: 70, observed_at: "2026-04-12T00:00:00Z" },
    ]);
    expect(s.last_sample_at).toBe("2026-04-15T00:00:00Z");
  });

  it("tail bust dominates RMSE (tail-aware σ, not bias-blind)", () => {
    const twentyNineSmall = Array.from({ length: 29 }, () => ({ actual: 70, forecast: 70 }));
    const oneBust = { actual: 94, forecast: 70 };
    const s = computeForecastErrorStats([...twentyNineSmall, oneBust]);
    expect(s.mae).toBeCloseTo(24 / 30, 5);
    expect(s.rmse).toBeCloseTo(Math.sqrt(576 / 30), 5);
    expect(s.rmse).toBeGreaterThan(s.mae * 4);
  });
});

describe("resolveEffectiveSigma", () => {
  const baseParams = {
    ensembleSigma: null,
    staticSigma: 3.5,
    minCalibrationSamples: 10,
    sigmaFloor: 3.0,
    sigmaCeiling: 7.0,
  };

  it("uses calibration RMSE when sample count is sufficient", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: {
        forecast_error_stdev: 4.0,
        forecast_error_rmse: 4.5,
        sample_count: 20,
      },
    });
    expect(r.source).toBe("calibration");
    expect(r.sigma).toBe(4.5);
    expect(r.clamped).toBe(false);
  });

  it("falls back to ensemble when calibration sample count is low", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: {
        forecast_error_stdev: 4.0,
        forecast_error_rmse: 4.5,
        sample_count: 5,
      },
      ensembleSigma: 3.2,
    });
    expect(r.source).toBe("ensemble");
    expect(r.sigma).toBe(3.2);
  });

  it("falls back to static when no calibration and no ensemble", () => {
    const r = resolveEffectiveSigma({ ...baseParams, calibration: null });
    expect(r.source).toBe("static_fallback");
    expect(r.sigma).toBe(3.5);
  });

  it("applies sigmaFloor clamp", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: {
        forecast_error_stdev: 1.0,
        forecast_error_rmse: 1.0,
        sample_count: 20,
      },
    });
    expect(r.source).toBe("calibration");
    expect(r.sigma).toBe(3.0);
    expect(r.rawSigma).toBe(1.0);
    expect(r.clamped).toBe(true);
  });

  it("applies sigmaCeiling clamp (prevents runaway σ after a bust)", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: {
        forecast_error_stdev: 9.0,
        forecast_error_rmse: 12.0,
        sample_count: 20,
      },
    });
    expect(r.source).toBe("calibration");
    expect(r.sigma).toBe(7.0);
    expect(r.rawSigma).toBe(12.0);
    expect(r.clamped).toBe(true);
  });

  it("ignores calibration when RMSE is 0 or non-finite", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: {
        forecast_error_stdev: 0,
        forecast_error_rmse: 0,
        sample_count: 30,
      },
      ensembleSigma: 3.1,
    });
    expect(r.source).toBe("ensemble");
  });

  it("ignores ensemble σ when it's zero or negative", () => {
    const r = resolveEffectiveSigma({
      ...baseParams,
      calibration: null,
      ensembleSigma: 0,
    });
    expect(r.source).toBe("static_fallback");
  });
});

describe("resolveForecastBiasCorrection", () => {
  const baseParams = {
    minCalibrationSamples: 5,
  };

  it("returns zero correction when calibration is null", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: null,
    });
    expect(r.biasCorrection).toBe(0);
    expect(r.source).toBe("none");
    expect(r.clamped).toBe(false);
  });

  it("returns zero correction when sample_count is below threshold", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: 1.2, sample_count: 3 },
    });
    expect(r.biasCorrection).toBe(0);
    expect(r.source).toBe("none");
  });

  it("returns zero correction when mean is non-finite", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: Number.NaN, sample_count: 20 },
    });
    expect(r.biasCorrection).toBe(0);
    expect(r.source).toBe("none");
  });

  it("returns signed mean when sample_count meets threshold (cold-biased forecast)", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: 0.58, sample_count: 20 },
    });
    expect(r.biasCorrection).toBeCloseTo(0.58, 5);
    expect(r.source).toBe("calibration");
    expect(r.clamped).toBe(false);
  });

  it("returns negative correction for warm-biased forecast", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: -1.2, sample_count: 20 },
    });
    expect(r.biasCorrection).toBeCloseTo(-1.2, 5);
    expect(r.source).toBe("calibration");
    expect(r.clamped).toBe(false);
  });

  it("clamps to +biasClamp when mean exceeds it (guards against bust-induced bias)", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: 6.0, sample_count: 20 },
      biasClamp: 2.0,
    });
    expect(r.biasCorrection).toBe(2.0);
    expect(r.rawMean).toBe(6.0);
    expect(r.clamped).toBe(true);
  });

  it("clamps to -biasClamp when mean is below it", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: -5.5, sample_count: 20 },
      biasClamp: 2.0,
    });
    expect(r.biasCorrection).toBe(-2.0);
    expect(r.rawMean).toBe(-5.5);
    expect(r.clamped).toBe(true);
  });

  it("defaults biasClamp to 2.0 when unspecified", () => {
    const r = resolveForecastBiasCorrection({
      ...baseParams,
      calibration: { forecast_error_mean: 4.0, sample_count: 20 },
    });
    expect(r.biasCorrection).toBe(2.0);
    expect(r.clamped).toBe(true);
  });
});
