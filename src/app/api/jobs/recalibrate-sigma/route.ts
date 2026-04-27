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
 *
 * Two correctness gates added after the wrong-day forecast bug fix:
 *   1. Postmortems are read in `created_at DESC` order so the dedup-by-date
 *      step deterministically picks the freshest sample for a given date.
 *   2. Samples are filtered to those whose recorded
 *      `feature_json.forecast_target_date` matches the market_date — i.e.
 *      they were produced by the post-fix run-model that selects the
 *      forecast for the actual market_date. Pre-fix postmortems lack
 *      `forecast_target_date` and would mix in wrong-day forecasts, so we
 *      exclude them here. The calibration row is upserted (or zeroed) on
 *      every run so the polluted pre-fix RMSE is cleared the first time
 *      this lands; the resolver falls back to ensemble σ until enough
 *      clean samples accumulate.
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
      dropped_legacy?: number;
      dropped_target_mismatch?: number;
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
        .eq("structured_json->>city_key", cityKey)
        .order("created_at", { ascending: false });

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
      let droppedNoTargetDate = 0;
      let droppedTargetMismatch = 0;
      for (const row of data ?? []) {
        const s = (row as { structured_json: Record<string, unknown> | null }).structured_json;
        if (!s) continue;
        const actual = Number(s.actual_high_temp);
        const modelAtSignal = s.model_at_signal as Record<string, unknown> | null;
        const featureJson = modelAtSignal?.feature_json as Record<string, unknown> | null;
        const forecast = Number(featureJson?.forecasted_high);
        const marketDate = typeof s.market_date === "string" ? s.market_date : null;
        const forecastTargetDate =
          typeof featureJson?.forecast_target_date === "string"
            ? (featureJson.forecast_target_date as string)
            : null;

        if (!Number.isFinite(actual) || !Number.isFinite(forecast) || !marketDate) continue;

        // Exclude pre-fix samples (no forecast_target_date recorded) and any
        // post-fix sample whose forecast was scored against a different date
        // than the market it was opened on. After the run-model fix these
        // should never disagree, so a mismatch indicates a bug we should
        // surface rather than silently calibrate against.
        if (!forecastTargetDate) {
          droppedNoTargetDate++;
          continue;
        }
        if (forecastTargetDate !== marketDate) {
          droppedTargetMismatch++;
          continue;
        }

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

      // Always upsert — even with zero samples — so a previously-polluted
      // calibration row is cleared the first time this runs. A zero-sample
      // row is below `minCalibrationSamples` so `resolveEffectiveSigma`
      // automatically falls back to ensemble σ.
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
        ...(stats.sample_count === 0
          ? { skipped: true, reason: "no_clean_samples" }
          : {}),
        ...(droppedNoTargetDate || droppedTargetMismatch
          ? {
              dropped_legacy: droppedNoTargetDate,
              dropped_target_mismatch: droppedTargetMismatch,
            }
          : {}),
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("recalibrate-sigma error:", err);
    return NextResponse.json({ error: "Failed to recalibrate sigma" }, { status: 500 });
  }
}
