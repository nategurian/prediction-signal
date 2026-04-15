import { getCityConfig } from "@/lib/config";
import { climatologyNormalHighFahrenheit } from "./climatology";
import { leadTimeHoursToForecastLocalNoon as computeLeadHoursToForecastLocalNoon } from "./zonedTime";
import type { WeatherForecast } from "./types";

/** Normalized JSON persisted on `external_data_snapshots` and mirrored in `model_outputs.feature_json`. */
export function buildNormalizedExternalJson(
  forecast: WeatherForecast,
  previousForecastHigh: number | null,
  cityKey: string
): Record<string, unknown> {
  const { timezone } = getCityConfig(cityKey);
  const climatologyNormalHighF = climatologyNormalHighFahrenheit(cityKey, forecast.forecastDate);
  const forecastAnomalyVsClimatologyF = forecast.forecastedHigh - climatologyNormalHighF;
  const leadHours = computeLeadHoursToForecastLocalNoon(
    forecast.forecastTimestamp,
    forecast.forecastDate,
    timezone
  );

  return {
    forecasted_high: forecast.forecastedHigh,
    forecast_date: forecast.forecastDate,
    current_temp: forecast.currentTemp,
    previous_forecast_high: previousForecastHigh,
    forecast_revision:
      previousForecastHigh != null ? forecast.forecastedHigh - previousForecastHigh : null,
    forecast_timestamp: forecast.forecastTimestamp,
    hourly_temps_count: forecast.hourlyTemps.length,
    lead_time_hours_to_forecast_local_noon: leadHours,
    climatology_normal_high_f: climatologyNormalHighF,
    forecast_anomaly_vs_climatology_f: forecastAnomalyVsClimatologyF,
    utc_offset_seconds: forecast.utcOffsetSeconds,
  };
}
