import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { fetchWeatherForecast, fetchEnsembleForecast } from "@/lib/weather/client";
import { buildNormalizedExternalJson } from "@/lib/weather/normalizeExternal";
import { validateForecastPayload } from "@/lib/weather/validateForecast";
import {
  insertExternalDataSnapshot,
  getLatestExternalData,
} from "@/lib/supabase/db";
import { getAllCityKeys, getSeriesConfig, sharedConfig } from "@/lib/config";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const cityKeys = getAllCityKeys();
    const results: { cityKey: string; snapshotId: string }[] = [];
    const errors: { cityKey: string; error: string }[] = [];

    for (const cityKey of cityKeys) {
      try {
        const forecast = await fetchWeatherForecast(cityKey);
        const previous = await getLatestExternalData(sharedConfig.nicheKey, cityKey);

        const previousNormalized = previous
          ? (previous.normalized_json as Record<string, unknown>)
          : null;

        // Phase 2a only fetches daily_high data, so the sigma floor used to
        // shore up the ensemble σ comes from the daily_high series. Phase 2b
        // will fetch lows alongside highs and apply per-variable floors.
        const dailyHighSeries = getSeriesConfig(cityKey, "daily_high");
        const ensemble = await fetchEnsembleForecast(cityKey);

        const validation = validateForecastPayload({
          forecastedHigh: forecast.forecastedHigh,
          forecastDate: forecast.forecastDate,
          currentTemp: forecast.currentTemp,
          forecastTimestamp: forecast.forecastTimestamp,
        });

        if (!validation.ok) {
          console.error(`refresh-external-data validation failed for ${cityKey}:`, validation.errors);
          errors.push({ cityKey, error: `Validation failed: ${validation.errors.join(", ")}` });
          continue;
        }

        const normalizedJson = buildNormalizedExternalJson(
          forecast,
          previousNormalized,
          cityKey,
          { ensemble, sigmaFloor: dailyHighSeries.sigmaFloor }
        );

        const snapshot = await insertExternalDataSnapshot({
          niche_key: sharedConfig.nicheKey,
          city_key: cityKey,
          source_name: "open_meteo",
          captured_at: new Date().toISOString(),
          normalized_json: normalizedJson,
          raw_json: forecast.rawResponse as unknown as Record<string, unknown>,
        });

        results.push({ cityKey, snapshotId: snapshot.id });
      } catch (err) {
        console.error(`refresh-external-data error for ${cityKey}:`, err);
        errors.push({ cityKey, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({ ok: true, snapshots: results, errors });
  } catch (err) {
    console.error("refresh-external-data error:", err);
    return NextResponse.json({ error: "Failed to refresh external data" }, { status: 500 });
  }
}
