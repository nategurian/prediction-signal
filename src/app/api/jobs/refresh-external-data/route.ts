import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { fetchWeatherForecast } from "@/lib/weather/client";
import {
  insertExternalDataSnapshot,
  getLatestExternalData,
} from "@/lib/supabase/db";
import { appConfig } from "@/lib/config";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const forecast = await fetchWeatherForecast();
    const previous = await getLatestExternalData(appConfig.nicheKey, appConfig.cityKey);

    const previousForecastHigh = previous
      ? (previous.normalized_json as Record<string, unknown>).forecasted_high as number | null
      : null;

    const normalizedJson = {
      forecasted_high: forecast.forecastedHigh,
      forecast_date: forecast.forecastDate,
      current_temp: forecast.currentTemp,
      previous_forecast_high: previousForecastHigh,
      forecast_revision: previousForecastHigh != null
        ? forecast.forecastedHigh - previousForecastHigh
        : null,
      forecast_timestamp: forecast.forecastTimestamp,
      hourly_temps_count: forecast.hourlyTemps.length,
    };

    const snapshot = await insertExternalDataSnapshot({
      niche_key: appConfig.nicheKey,
      city_key: appConfig.cityKey,
      source_name: "open_meteo",
      captured_at: new Date().toISOString(),
      normalized_json: normalizedJson,
      raw_json: forecast.rawResponse as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ ok: true, snapshot_id: snapshot.id, forecast: normalizedJson });
  } catch (err) {
    console.error("refresh-external-data error:", err);
    return NextResponse.json({ error: "Failed to refresh external data" }, { status: 500 });
  }
}
