import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { upsertCityCalibration } from "@/lib/supabase/db";
import {
  computeForecastErrorStats,
  type ForecastErrorSample,
} from "@/lib/engine/calibration";
import { getCityConfig, getAllCityKeys, sharedConfig } from "@/lib/config";

/**
 * Recompute per-city empirical forecast-error σ from settled trade postmortems.
 *
 * Reads structured_json.actual_high_temp and structured_json.model_at_signal
 *   .feature_json.forecasted_high from postmortems created within the last
 * `calibrationWindowDays` days per city, deduplicates by market_date (one
 * weather outcome per day), and stores the result in `city_calibrations`.
 */
export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const db = getSupabaseAdmin();
    const cities = getAllCityKeys();
    const nowMs = Date.now();

    const results: Array<{
      city_key: string;
      sample_count: number;
      forecast_error_stdev: number;
      forecast_error_rmse: number;
      window_days: number;
      skipped?: boolean;
      reason?: string;
    }> = [];

    for (const cityKey of cities) {
      const cfg = getCityConfig(cityKey);
      const windowDays = cfg.calibrationWindowDays;
      const cutoffIso = new Date(
        nowMs - windowDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await db
        .from("trade_postmortems")
        .select("structured_json, created_at")
        .gte("created_at", cutoffIso)
        .eq("structured_json->>city_key", cityKey);

      if (error) {
        console.error(`recalibrate-sigma ${cityKey} fetch error:`, error);
        results.push({
          city_key: cityKey,
          sample_count: 0,
          forecast_error_stdev: 0,
          forecast_error_rmse: 0,
          window_days: windowDays,
          skipped: true,
          reason: `fetch_error: ${error.message}`,
        });
        continue;
      }

      const byDate = new Map<string, ForecastErrorSample>();
      for (const row of data ?? []) {
        const s = (row as { structured_json: Record<string, unknown> | null }).structured_json;
        if (!s) continue;
        const actual = Number(s.actual_high_temp);
        const modelAtSignal = s.model_at_signal as Record<string, unknown> | null;
        const featureJson = modelAtSignal?.feature_json as Record<string, unknown> | null;
        const forecast = Number(featureJson?.forecasted_high);
        const marketDate = typeof s.market_date === "string" ? s.market_date : null;
        if (!Number.isFinite(actual) || !Number.isFinite(forecast) || !marketDate) continue;
        if (!byDate.has(marketDate)) {
          byDate.set(marketDate, {
            actual,
            forecast,
            observed_at: (row as { created_at: string }).created_at,
          });
        }
      }

      const samples = Array.from(byDate.values());
      const stats = computeForecastErrorStats(samples);

      if (stats.sample_count === 0) {
        results.push({
          city_key: cityKey,
          sample_count: 0,
          forecast_error_stdev: 0,
          forecast_error_rmse: 0,
          window_days: windowDays,
          skipped: true,
          reason: "no_samples",
        });
        continue;
      }

      await upsertCityCalibration({
        city_key: cityKey,
        niche_key: sharedConfig.nicheKey,
        forecast_error_stdev: stats.stdev,
        forecast_error_rmse: stats.rmse,
        forecast_error_mae: stats.mae,
        forecast_error_mean: stats.mean,
        sample_count: stats.sample_count,
        window_days: windowDays,
        last_sample_at: stats.last_sample_at,
      });

      results.push({
        city_key: cityKey,
        sample_count: stats.sample_count,
        forecast_error_stdev: Number(stats.stdev.toFixed(3)),
        forecast_error_rmse: Number(stats.rmse.toFixed(3)),
        window_days: windowDays,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("recalibrate-sigma error:", err);
    return NextResponse.json({ error: "Failed to recalibrate sigma" }, { status: 500 });
  }
}
