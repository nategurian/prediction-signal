import { describe, it, expect } from "vitest";
import { buildNormalizedExternalJson } from "../normalizeExternal";
import type { WeatherForecast, EnsembleForecast } from "../types";

const baseForecast: WeatherForecast = {
  forecastedHigh: 85,
  forecastDate: "2026-04-15",
  currentTemp: 78,
  hourlyTemps: [],
  forecastTimestamp: new Date().toISOString(),
  utcOffsetSeconds: -14400,
  rawResponse: {} as WeatherForecast["rawResponse"],
};

describe("buildNormalizedExternalJson — ensemble fields", () => {
  it("includes ensemble fields when ensemble data is provided", () => {
    const ensemble: EnsembleForecast = {
      ensembleMean: 85.2,
      ensembleStdev: 2.1,
      ensembleMin: 81.0,
      ensembleMax: 89.5,
      memberCount: 50,
      memberHighs: Array.from({ length: 50 }, (_, i) => 81 + i * 0.18),
      forecastDate: "2026-04-15",
    };
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(true);
    expect(result.ensemble_mean).toBe(85.2);
    expect(result.ensemble_stdev).toBe(2.1);
    expect(result.ensemble_min).toBe(81.0);
    expect(result.ensemble_max).toBe(89.5);
    expect(result.ensemble_member_count).toBe(50);
    expect(result.ensemble_sigma_used).toBe(2.1);
  });

  it("applies sigma floor when ensemble stdev is below it", () => {
    const ensemble: EnsembleForecast = {
      ensembleMean: 85.0,
      ensembleStdev: 0.8,
      ensembleMin: 83.5,
      ensembleMax: 86.2,
      memberCount: 50,
      memberHighs: Array.from({ length: 50 }, (_, i) => 83.5 + i * 0.055),
      forecastDate: "2026-04-15",
    };
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(true);
    expect(result.ensemble_stdev).toBe(0.8);
    expect(result.ensemble_sigma_used).toBe(1.5);
  });

  it("marks ensemble_available false when ensemble is null", () => {
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc", {
      ensemble: null,
      sigmaFloor: 1.5,
    });
    expect(result.ensemble_available).toBe(false);
    expect(result.ensemble_mean).toBeUndefined();
    expect(result.ensemble_stdev).toBeUndefined();
    expect(result.ensemble_sigma_used).toBeUndefined();
  });

  it("still includes all original fields when ensemble is provided", () => {
    const result = buildNormalizedExternalJson(baseForecast, 84, "nyc", {
      ensemble: null,
      sigmaFloor: 1.5,
    });
    expect(result.forecasted_high).toBe(85);
    expect(result.previous_forecast_high).toBe(84);
    expect(result.forecast_revision).toBe(1);
  });

  it("preserves backward compatibility when no ensemble options passed", () => {
    const result = buildNormalizedExternalJson(baseForecast, null, "nyc");
    expect(result.forecasted_high).toBe(85);
    expect(result.ensemble_available).toBeUndefined();
  });
});
