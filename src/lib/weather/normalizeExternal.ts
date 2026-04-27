import { getCityConfig } from "@/lib/config";
import { climatologyNormalHighFahrenheit } from "./climatology";
import { leadTimeHoursToForecastLocalNoon as computeLeadHoursToForecastLocalNoon } from "./zonedTime";
import type {
  WeatherForecast,
  EnsembleForecast,
  DailyEnsembleForecast,
} from "./types";

/**
 * Per-date weather snapshot embedded in `daily_forecasts`.
 * One entry per target date returned by the upstream forecast API.
 */
export interface NormalizedDailyForecast {
  forecast_date: string;
  forecasted_high: number;
  /** Same forecast for the same target date in the prior snapshot, or null. */
  previous_forecasted_high: number | null;
  forecast_revision: number | null;
  climatology_normal_high_f: number;
  forecast_anomaly_vs_climatology_f: number;
  lead_time_hours_to_forecast_local_noon: number;
  ensemble_available: boolean;
  ensemble_mean?: number;
  ensemble_stdev?: number;
  ensemble_min?: number;
  ensemble_max?: number;
  ensemble_member_count?: number;
  ensemble_sigma_used?: number;
}

/**
 * Build the previous-snapshot lookup table for forecast_date → forecasted_high.
 * Reads from `daily_forecasts` (post-fix snapshots) and falls back to the
 * legacy top-level `forecasted_high` keyed by `forecast_date` for snapshots
 * captured before the per-date fix landed. Returns an empty map when the
 * argument is null/empty.
 */
function buildPreviousByDate(
  previousNormalized: Record<string, unknown> | null
): Map<string, number> {
  const out = new Map<string, number>();
  if (!previousNormalized) return out;

  const daily = previousNormalized.daily_forecasts;
  if (Array.isArray(daily)) {
    for (const entry of daily) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const date = typeof e.forecast_date === "string" ? e.forecast_date : null;
      const high = typeof e.forecasted_high === "number" ? e.forecasted_high : NaN;
      if (date && Number.isFinite(high)) out.set(date, high);
    }
    return out;
  }

  const legacyDate = typeof previousNormalized.forecast_date === "string"
    ? previousNormalized.forecast_date
    : null;
  const legacyHigh = typeof previousNormalized.forecasted_high === "number"
    ? previousNormalized.forecasted_high
    : NaN;
  if (legacyDate && Number.isFinite(legacyHigh)) {
    out.set(legacyDate, legacyHigh);
  }
  return out;
}

/** Normalized JSON persisted on `external_data_snapshots` and mirrored in `model_outputs.feature_json`. */
export function buildNormalizedExternalJson(
  forecast: WeatherForecast,
  /**
   * Either the previous snapshot's full `normalized_json` object (preferred —
   * supports per-date revision tracking) OR a legacy single number representing
   * the previous index-0 forecasted high (kept for back-compat with older callers
   * and tests). Pass `null` when there is no prior snapshot.
   */
  previous: Record<string, unknown> | number | null,
  cityKey: string,
  ensembleOptions?: {
    ensemble: EnsembleForecast | null;
    sigmaFloor: number;
  }
): Record<string, unknown> {
  const { timezone } = getCityConfig(cityKey);

  const previousNormalized: Record<string, unknown> | null =
    previous != null && typeof previous === "object" ? previous : null;
  const previousLegacyHigh: number | null =
    typeof previous === "number" && Number.isFinite(previous) ? previous : null;

  const previousByDate = buildPreviousByDate(previousNormalized);
  const ensembleByDate = new Map<string, DailyEnsembleForecast>();
  if (ensembleOptions?.ensemble?.dailyEnsembles) {
    for (const e of ensembleOptions.ensemble.dailyEnsembles) {
      ensembleByDate.set(e.forecastDate, e);
    }
  }

  const sigmaFloor = ensembleOptions?.sigmaFloor;

  const dailyHighs = forecast.dailyHighs.length > 0
    ? forecast.dailyHighs
    : [{ forecastDate: forecast.forecastDate, forecastedHigh: forecast.forecastedHigh }];

  const dailyForecasts: NormalizedDailyForecast[] = dailyHighs.map((day, idx) => {
    const climatologyNormalHighF = climatologyNormalHighFahrenheit(cityKey, day.forecastDate);
    const forecastAnomalyVsClimatologyF = day.forecastedHigh - climatologyNormalHighF;
    const leadHours = computeLeadHoursToForecastLocalNoon(
      forecast.forecastTimestamp,
      day.forecastDate,
      timezone
    );

    let prevHigh = previousByDate.get(day.forecastDate);
    if (prevHigh === undefined && idx === 0 && previousLegacyHigh != null) {
      prevHigh = previousLegacyHigh;
    }
    const previousForecastedHigh = prevHigh !== undefined && Number.isFinite(prevHigh)
      ? prevHigh
      : null;

    const entry: NormalizedDailyForecast = {
      forecast_date: day.forecastDate,
      forecasted_high: day.forecastedHigh,
      previous_forecasted_high: previousForecastedHigh,
      forecast_revision:
        previousForecastedHigh != null
          ? day.forecastedHigh - previousForecastedHigh
          : null,
      climatology_normal_high_f: climatologyNormalHighF,
      forecast_anomaly_vs_climatology_f: forecastAnomalyVsClimatologyF,
      lead_time_hours_to_forecast_local_noon: leadHours,
      ensemble_available: false,
    };

    const ensembleDay = ensembleByDate.get(day.forecastDate);
    if (ensembleDay && sigmaFloor != null) {
      entry.ensemble_available = true;
      entry.ensemble_mean = ensembleDay.ensembleMean;
      entry.ensemble_stdev = ensembleDay.ensembleStdev;
      entry.ensemble_min = ensembleDay.ensembleMin;
      entry.ensemble_max = ensembleDay.ensembleMax;
      entry.ensemble_member_count = ensembleDay.memberCount;
      entry.ensemble_sigma_used = Math.max(ensembleDay.ensembleStdev, sigmaFloor);
    }

    return entry;
  });

  const head = dailyForecasts[0];

  const base: Record<string, unknown> = {
    forecasted_high: head.forecasted_high,
    forecast_date: head.forecast_date,
    current_temp: forecast.currentTemp,
    previous_forecast_high: head.previous_forecasted_high,
    forecast_revision: head.forecast_revision,
    forecast_timestamp: forecast.forecastTimestamp,
    hourly_temps_count: forecast.hourlyTemps.length,
    lead_time_hours_to_forecast_local_noon: head.lead_time_hours_to_forecast_local_noon,
    climatology_normal_high_f: head.climatology_normal_high_f,
    forecast_anomaly_vs_climatology_f: head.forecast_anomaly_vs_climatology_f,
    utc_offset_seconds: forecast.utcOffsetSeconds,
    daily_forecasts: dailyForecasts,
  };

  if (ensembleOptions) {
    const { ensemble } = ensembleOptions;
    if (ensemble && head.ensemble_available) {
      base.ensemble_available = true;
      base.ensemble_mean = head.ensemble_mean;
      base.ensemble_stdev = head.ensemble_stdev;
      base.ensemble_min = head.ensemble_min;
      base.ensemble_max = head.ensemble_max;
      base.ensemble_member_count = head.ensemble_member_count;
      base.ensemble_sigma_used = head.ensemble_sigma_used;
    } else {
      base.ensemble_available = false;
    }
  }

  return base;
}

/**
 * Look up the per-date forecast slice for a given target date in a stored
 * `normalized_json`. Returns null when the snapshot doesn't include
 * `daily_forecasts` (legacy snapshot) or when no entry matches.
 */
export function findDailyForecastForDate(
  normalizedJson: Record<string, unknown> | null | undefined,
  targetDate: string | null | undefined
): NormalizedDailyForecast | null {
  if (!normalizedJson || !targetDate) return null;
  const list = normalizedJson.daily_forecasts;
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.forecast_date === targetDate && typeof e.forecasted_high === "number") {
      return e as unknown as NormalizedDailyForecast;
    }
  }
  return null;
}
