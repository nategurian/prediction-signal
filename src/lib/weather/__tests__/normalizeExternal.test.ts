import { describe, it, expect } from "vitest";
import {
  buildNormalizedExternalJson,
  findDailyForecastForDate,
} from "../normalizeExternal";
import type {
  WeatherForecast,
  EnsembleForecast,
  DailyEnsembleForecast,
} from "../types";

const baseForecast: WeatherForecast = {
  forecastedHigh: 85,
  forecastDate: "2026-04-15",
  dailyHighs: [{ forecastDate: "2026-04-15", forecastedHigh: 85 }],
  currentTemp: 78,
  hourlyTemps: [],
  forecastTimestamp: new Date().toISOString(),
  utcOffsetSeconds: -14400,
  rawResponse: {} as WeatherForecast["rawResponse"],
};

function buildEnsemble(highs: { forecastDate: string; mean: number; stdev: number; min: number; max: number; memberCount: number; memberHighs: number[] }[]): EnsembleForecast {
  const dailyEnsembles: DailyEnsembleForecast[] = highs.map((h) => ({
    forecastDate: h.forecastDate,
    ensembleMean: h.mean,
    ensembleStdev: h.stdev,
    ensembleMin: h.min,
    ensembleMax: h.max,
    memberCount: h.memberCount,
    memberHighs: h.memberHighs,
  }));
  const head = dailyEnsembles[0];
  return {
    ensembleMean: head.ensembleMean,
    ensembleStdev: head.ensembleStdev,
    ensembleMin: head.ensembleMin,
    ensembleMax: head.ensembleMax,
    memberCount: head.memberCount,
    memberHighs: head.memberHighs,
    forecastDate: head.forecastDate,
    dailyEnsembles,
  };
}

describe("buildNormalizedExternalJson — ensemble fields", () => {
  it("includes ensemble fields when ensemble data is provided", () => {
    const ensemble = buildEnsemble([
      {
        forecastDate: "2026-04-15",
        mean: 85.2,
        stdev: 2.1,
        min: 81.0,
        max: 89.5,
        memberCount: 50,
        memberHighs: Array.from({ length: 50 }, (_, i) => 81 + i * 0.18),
      },
    ]);
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
    const ensemble = buildEnsemble([
      {
        forecastDate: "2026-04-15",
        mean: 85.0,
        stdev: 0.8,
        min: 83.5,
        max: 86.2,
        memberCount: 50,
        memberHighs: Array.from({ length: 50 }, (_, i) => 83.5 + i * 0.055),
      },
    ]);
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

  it("still includes all original fields when previous high is provided as a number", () => {
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

describe("buildNormalizedExternalJson — per-date daily_forecasts", () => {
  const multiDayForecast: WeatherForecast = {
    ...baseForecast,
    forecastedHigh: 80,
    forecastDate: "2026-04-15",
    dailyHighs: [
      { forecastDate: "2026-04-15", forecastedHigh: 80 },
      { forecastDate: "2026-04-16", forecastedHigh: 84 },
      { forecastDate: "2026-04-17", forecastedHigh: 88 },
    ],
  };

  it("emits one daily_forecasts entry per supplied dailyHigh", () => {
    const result = buildNormalizedExternalJson(multiDayForecast, null, "nyc");
    const daily = result.daily_forecasts as Array<{
      forecast_date: string;
      forecasted_high: number;
    }>;
    expect(daily.map((d) => d.forecast_date)).toEqual([
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
    ]);
    expect(daily.map((d) => d.forecasted_high)).toEqual([80, 84, 88]);
  });

  it("matches per-date ensemble entries to the right target date", () => {
    const ensemble = buildEnsemble([
      { forecastDate: "2026-04-15", mean: 80, stdev: 1.0, min: 78, max: 82, memberCount: 50, memberHighs: [] },
      { forecastDate: "2026-04-16", mean: 84, stdev: 2.5, min: 79, max: 89, memberCount: 50, memberHighs: [] },
      { forecastDate: "2026-04-17", mean: 88, stdev: 3.5, min: 82, max: 95, memberCount: 50, memberHighs: [] },
    ]);
    const result = buildNormalizedExternalJson(multiDayForecast, null, "nyc", {
      ensemble,
      sigmaFloor: 1.5,
    });
    const daily = result.daily_forecasts as Array<Record<string, unknown>>;
    expect(daily[0].ensemble_stdev).toBe(1.0);
    expect(daily[0].ensemble_sigma_used).toBe(1.5);
    expect(daily[1].ensemble_stdev).toBe(2.5);
    expect(daily[1].ensemble_sigma_used).toBe(2.5);
    expect(daily[2].ensemble_stdev).toBe(3.5);
  });

  it("computes per-date previous_forecasted_high from a prior snapshot's daily_forecasts", () => {
    const previousSnapshot = buildNormalizedExternalJson(
      {
        ...multiDayForecast,
        dailyHighs: [
          { forecastDate: "2026-04-15", forecastedHigh: 78 },
          { forecastDate: "2026-04-16", forecastedHigh: 81 },
          { forecastDate: "2026-04-17", forecastedHigh: 85 },
        ],
        forecastedHigh: 78,
      },
      null,
      "nyc"
    );

    const result = buildNormalizedExternalJson(multiDayForecast, previousSnapshot, "nyc");
    const daily = result.daily_forecasts as Array<{
      forecast_date: string;
      previous_forecasted_high: number | null;
      forecast_revision: number | null;
    }>;
    expect(daily[0].previous_forecasted_high).toBe(78);
    expect(daily[0].forecast_revision).toBe(2);
    expect(daily[1].previous_forecasted_high).toBe(81);
    expect(daily[1].forecast_revision).toBe(3);
    expect(daily[2].previous_forecasted_high).toBe(85);
    expect(daily[2].forecast_revision).toBe(3);
  });

  it("falls back to legacy top-level forecasted_high for index 0 when previous snapshot lacks daily_forecasts", () => {
    const legacyPrevious = {
      forecasted_high: 79,
      forecast_date: "2026-04-15",
    };
    const result = buildNormalizedExternalJson(multiDayForecast, legacyPrevious, "nyc");
    const daily = result.daily_forecasts as Array<{
      forecast_date: string;
      previous_forecasted_high: number | null;
    }>;
    expect(daily[0].previous_forecasted_high).toBe(79);
    expect(daily[1].previous_forecasted_high).toBeNull();
  });
});

describe("findDailyForecastForDate", () => {
  const normalized = buildNormalizedExternalJson(
    {
      ...baseForecast,
      dailyHighs: [
        { forecastDate: "2026-04-15", forecastedHigh: 80 },
        { forecastDate: "2026-04-16", forecastedHigh: 84 },
      ],
    },
    null,
    "nyc"
  );

  it("returns the matching per-date entry", () => {
    const entry = findDailyForecastForDate(normalized, "2026-04-16");
    expect(entry?.forecasted_high).toBe(84);
    expect(entry?.forecast_date).toBe("2026-04-16");
  });

  it("returns null when the target date is outside the forecast horizon", () => {
    expect(findDailyForecastForDate(normalized, "2026-04-20")).toBeNull();
  });

  it("returns null when the snapshot has no daily_forecasts (legacy snapshot)", () => {
    const legacy = { forecasted_high: 80, forecast_date: "2026-04-15" };
    expect(findDailyForecastForDate(legacy, "2026-04-15")).toBeNull();
  });

  it("returns null on null inputs", () => {
    expect(findDailyForecastForDate(null, "2026-04-15")).toBeNull();
    expect(findDailyForecastForDate(normalized, null)).toBeNull();
  });
});
