import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { fetchWeatherForecast } from "@/lib/weather/client";
import { buildNormalizedExternalJson } from "@/lib/weather/normalizeExternal";
import { validateForecastPayload } from "@/lib/weather/validateForecast";
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

    const validation = validateForecastPayload({
      forecastedHigh: forecast.forecastedHigh,
      forecastDate: forecast.forecastDate,
      currentTemp: forecast.currentTemp,
      forecastTimestamp: forecast.forecastTimestamp,
    });

    if (!validation.ok) {
      console.error("refresh-external-data validation failed:", validation.errors);
      return NextResponse.json(
        { error: "Forecast validation failed", details: validation.errors },
        { status: 422 }
      );
    }

    const normalizedJson = buildNormalizedExternalJson(
      forecast,
      previousForecastHigh,
      appConfig.cityKey
    );

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
