import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getActiveMarkets,
  getLatestSnapshot,
  getLatestExternalData,
  insertModelOutput,
  type ExternalDataSnapshot,
} from "@/lib/supabase/db";
import { computeModeledProbability } from "@/lib/engine/probability";
import { computeConfidenceScore } from "@/lib/engine/confidence";
import { getCityConfig, getAllCityKeys, sharedConfig } from "@/lib/config";

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

    let modelsCreated = 0;

    for (const market of markets) {
      try {
        const cityConfig = getCityConfig(market.city_key);
        const externalData = externalDataByCity.get(market.city_key);

        if (!externalData) {
          console.warn(`run-model skip market ${market.ticker}: no external data for city ${market.city_key}`);
          continue;
        }

        const snapshot = await getLatestSnapshot(market.id);
        if (!snapshot) continue;

        const normalized = externalData.normalized_json as Record<string, unknown>;
        const forecastedHigh = normalized.forecasted_high as number;
        const forecastTimestamp = normalized.forecast_timestamp as string;
        const previousForecastHigh = normalized.previous_forecast_high as number | null;
        const currentTemp = normalized.current_temp as number | null;
        const leadTimeHours = normalized.lead_time_hours_to_forecast_local_noon;
        const climatologyNormalHighF = normalized.climatology_normal_high_f;
        const forecastAnomalyVsClimatologyF = normalized.forecast_anomaly_vs_climatology_f;

        if (forecastedHigh == null || Number.isNaN(Number(forecastedHigh))) continue;

        const ensembleAvailable = normalized.ensemble_available === true;
        const ensembleSigmaUsed = normalized.ensemble_sigma_used;
        const ensembleStdev = normalized.ensemble_stdev;
        const ensembleMean = normalized.ensemble_mean;
        const ensembleMemberCount = normalized.ensemble_member_count;

        const effectiveSigma =
          ensembleAvailable &&
          typeof ensembleSigmaUsed === "number" &&
          Number.isFinite(ensembleSigmaUsed)
            ? ensembleSigmaUsed
            : cityConfig.sigma;

        const sigmaSource = ensembleAvailable &&
          typeof ensembleSigmaUsed === "number" &&
          Number.isFinite(ensembleSigmaUsed)
            ? "ensemble" as const
            : "static_fallback" as const;

        const probResult = computeModeledProbability({
          forecastHigh: forecastedHigh,
          marketStructure: market.market_structure,
          threshold: market.threshold_value,
          thresholdDirection: market.threshold_direction,
          bucketLower: market.bucket_lower,
          bucketUpper: market.bucket_upper,
          sigma: effectiveSigma,
        });

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
          forecasted_high: forecastedHigh,
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
          model_version: cityConfig.modelVersion,
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

    return NextResponse.json({ ok: true, models_created: modelsCreated });
  } catch (err) {
    console.error("run-model error:", err);
    return NextResponse.json({ error: "Failed to run model" }, { status: 500 });
  }
}
