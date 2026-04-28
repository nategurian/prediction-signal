import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getActiveMarkets,
  getLatestSnapshot,
  getLatestExternalData,
  getAllCityCalibrations,
  insertModelOutput,
  type CityCalibration,
  type ExternalDataSnapshot,
} from "@/lib/supabase/db";
import { computeModeledProbability } from "@/lib/engine/probability";
import { computeConfidenceScore } from "@/lib/engine/confidence";
import {
  resolveEffectiveSigma,
  resolveForecastBiasCorrection,
} from "@/lib/engine/calibration";
import { findDailyForecastForVariableAndDate } from "@/lib/weather/normalizeExternal";
import {
  getCityConfig,
  getAllCityKeys,
  getSeriesConfig,
  sharedConfig,
} from "@/lib/config";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const markets = await getActiveMarkets();

    const externalDataByCity = new Map<string, ExternalDataSnapshot>();
    for (const cityKey of getAllCityKeys()) {
      const data = await getLatestExternalData(sharedConfig.nicheKey, cityKey);
      if (data) externalDataByCity.set(cityKey, data);
    }

    const calibrations = await getAllCityCalibrations();
    const calibrationByCityVariable = new Map<string, CityCalibration>();
    for (const c of calibrations) {
      calibrationByCityVariable.set(`${c.city_key}|${c.variable}`, c);
    }

    let modelsCreated = 0;
    let modelsSkippedNoForecast = 0;

    for (const market of markets) {
      try {
        const cityConfig = getCityConfig(market.city_key);
        const seriesConfig = getSeriesConfig(market.city_key, market.variable);
        const externalData = externalDataByCity.get(market.city_key);

        if (!externalData) {
          console.warn(`run-model skip market ${market.ticker}: no external data for city ${market.city_key}`);
          continue;
        }

        if (!market.market_date) {
          console.warn(`run-model skip market ${market.ticker}: market has no market_date`);
          continue;
        }

        const snapshot = await getLatestSnapshot(market.id);
        if (!snapshot) continue;

        const normalized = externalData.normalized_json as Record<string, unknown>;
        const dailyForecast = findDailyForecastForVariableAndDate(
          normalized,
          market.variable,
          market.market_date
        );

        if (!dailyForecast) {
          console.warn(
            `run-model skip market ${market.ticker}: no forecast available for market_date ${market.market_date} variable ${market.variable} ` +
              `(snapshot covers ${(normalized.daily_forecasts as Array<{ forecast_date: string }> | undefined)?.map((d) => d.forecast_date).join(",") ?? normalized.forecast_date})`
          );
          modelsSkippedNoForecast++;
          continue;
        }

        const forecastedHigh = dailyForecast.forecasted_high;
        const forecastTimestamp = normalized.forecast_timestamp as string;
        const previousForecastHigh = dailyForecast.previous_forecasted_high;
        const currentTemp = normalized.current_temp as number | null;
        const leadTimeHours = dailyForecast.lead_time_hours_to_forecast_local_noon;
        const climatologyNormalHighF = dailyForecast.climatology_normal_high_f;
        const forecastAnomalyVsClimatologyF = dailyForecast.forecast_anomaly_vs_climatology_f;

        if (forecastedHigh == null || Number.isNaN(Number(forecastedHigh))) continue;

        const ensembleAvailable = dailyForecast.ensemble_available === true;
        const ensembleSigmaUsed = dailyForecast.ensemble_sigma_used;
        const ensembleStdev = dailyForecast.ensemble_stdev;
        const ensembleMean = dailyForecast.ensemble_mean;
        const ensembleMemberCount = dailyForecast.ensemble_member_count;

        const ensembleSigmaCandidate =
          ensembleAvailable &&
          typeof ensembleSigmaUsed === "number" &&
          Number.isFinite(ensembleSigmaUsed)
            ? ensembleSigmaUsed
            : null;

        const calibration =
          calibrationByCityVariable.get(`${market.city_key}|${market.variable}`) ??
          null;
        const resolved = resolveEffectiveSigma({
          calibration,
          ensembleSigma: ensembleSigmaCandidate,
          staticSigma: seriesConfig.sigma,
          minCalibrationSamples: cityConfig.minCalibrationSamples,
          sigmaFloor: seriesConfig.sigmaFloor,
          sigmaCeiling: seriesConfig.sigmaCeiling,
        });
        const effectiveSigma = resolved.sigma;
        const sigmaSource = resolved.source;

        const bias = resolveForecastBiasCorrection({
          calibration,
          minCalibrationSamples: cityConfig.minCalibrationSamples,
        });
        const biasCorrectedForecastHigh = forecastedHigh + bias.biasCorrection;

        const probResult = computeModeledProbability({
          forecastHigh: biasCorrectedForecastHigh,
          marketStructure: market.market_structure,
          threshold: market.threshold_value,
          thresholdDirection: market.threshold_direction,
          bucketLower: market.bucket_lower,
          bucketUpper: market.bucket_upper,
          sigma: effectiveSigma,
        });

        // Confidence scoring stays on the RAW forecast. Confidence is about
        // information quality (freshness, threshold distance, revision
        // stability, spread) — applying a bias correction would make a stale
        // forecast appear less stale than it is.
        const confidence = computeConfidenceScore({
          forecastTimestamp,
          forecastHigh: forecastedHigh,
          threshold: market.threshold_value,
          previousForecastHigh,
          yesBid: snapshot.yes_bid,
          yesAsk: snapshot.yes_ask,
          sigma: effectiveSigma,
        }, sharedConfig.confidenceWeights);

        const featureJson = {
          variable: market.variable,
          forecasted_value: forecastedHigh,
          forecasted_high: forecastedHigh,
          forecast_target_date: market.market_date,
          forecast_source_date: dailyForecast.forecast_date,
          current_temp: currentTemp,
          forecast_timestamp: forecastTimestamp,
          previous_forecast_high: previousForecastHigh,
          forecast_revision: previousForecastHigh != null ? forecastedHigh - previousForecastHigh : null,
          lead_time_hours_to_forecast_local_noon:
            typeof leadTimeHours === "number" && Number.isFinite(leadTimeHours) ? leadTimeHours : null,
          climatology_normal_high_f:
            typeof climatologyNormalHighF === "number" && Number.isFinite(climatologyNormalHighF)
              ? climatologyNormalHighF
              : null,
          forecast_anomaly_vs_climatology_f:
            typeof forecastAnomalyVsClimatologyF === "number" &&
            Number.isFinite(forecastAnomalyVsClimatologyF)
              ? forecastAnomalyVsClimatologyF
              : null,
          sigma: effectiveSigma,
          sigma_source: sigmaSource,
          sigma_raw: resolved.rawSigma,
          sigma_clamped: resolved.clamped,
          bias_correction: bias.biasCorrection,
          bias_source: bias.source,
          bias_raw_mean: bias.rawMean,
          bias_clamped: bias.clamped,
          forecasted_high_bias_corrected: biasCorrectedForecastHigh,
          calibration_sample_count: calibration?.sample_count ?? null,
          calibration_rmse: calibration?.forecast_error_rmse ?? null,
          calibration_mean: calibration?.forecast_error_mean ?? null,
          ensemble_stdev:
            typeof ensembleStdev === "number" && Number.isFinite(ensembleStdev)
              ? ensembleStdev
              : null,
          ensemble_mean:
            typeof ensembleMean === "number" && Number.isFinite(ensembleMean)
              ? ensembleMean
              : null,
          ensemble_member_count:
            typeof ensembleMemberCount === "number" ? ensembleMemberCount : null,
          threshold: market.threshold_value,
          threshold_direction: market.threshold_direction,
          bucket_lower: market.bucket_lower,
          bucket_upper: market.bucket_upper,
          market_structure: market.market_structure,
          yes_bid: snapshot.yes_bid,
          yes_ask: snapshot.yes_ask,
          no_bid: snapshot.no_bid,
          no_ask: snapshot.no_ask,
        };

        await insertModelOutput({
          market_id: market.id,
          captured_at: new Date().toISOString(),
          modeled_probability: probResult.modeledYesProbability,
          confidence_score: confidence,
          feature_json: featureJson,
          model_version: seriesConfig.modelVersion,
          external_data_id: externalData.id,
        });

        modelsCreated++;
      } catch (err) {
        console.error(
          `run-model skip market ${market.ticker} (${market.id}):`,
          err instanceof Error ? err.message : err
        );
      }
    }

    return NextResponse.json({
      ok: true,
      models_created: modelsCreated,
      markets_skipped_no_forecast: modelsSkippedNoForecast,
    });
  } catch (err) {
    console.error("run-model error:", err);
    return NextResponse.json({ error: "Failed to run model" }, { status: 500 });
  }
}
