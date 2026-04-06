import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/utils/auth";
import {
  getActiveMarkets,
  getLatestSnapshot,
  getLatestExternalData,
  insertModelOutput,
} from "@/lib/supabase/db";
import { computeModeledProbability } from "@/lib/engine/probability";
import { computeConfidenceScore } from "@/lib/engine/confidence";
import { appConfig } from "@/lib/config";

export async function POST(req: Request) {
  const authError = validateCronSecret(req);
  if (authError) return authError;

  try {
    const markets = await getActiveMarkets();
    const externalData = await getLatestExternalData(appConfig.nicheKey, appConfig.cityKey);

    if (!externalData) {
      return NextResponse.json({ error: "No external data available" }, { status: 400 });
    }

    const normalized = externalData.normalized_json as Record<string, unknown>;
    const forecastedHigh = normalized.forecasted_high as number;
    const forecastTimestamp = normalized.forecast_timestamp as string;
    const previousForecastHigh = normalized.previous_forecast_high as number | null;
    const currentTemp = normalized.current_temp as number | null;

    if (forecastedHigh == null || Number.isNaN(Number(forecastedHigh))) {
      return NextResponse.json({ error: "normalized_json.forecasted_high is missing or invalid" }, { status: 400 });
    }

    let modelsCreated = 0;

    for (const market of markets) {
      try {
        const snapshot = await getLatestSnapshot(market.id);
        if (!snapshot) continue;

        const probResult = computeModeledProbability({
          forecastHigh: forecastedHigh,
          marketStructure: market.market_structure,
          threshold: market.threshold_value,
          bucketLower: market.bucket_lower,
          bucketUpper: market.bucket_upper,
          sigma: appConfig.sigma,
        });

        const confidence = computeConfidenceScore({
          forecastTimestamp,
          forecastHigh: forecastedHigh,
          threshold: market.threshold_value,
          previousForecastHigh,
          yesBid: snapshot.yes_bid,
          yesAsk: snapshot.yes_ask,
          sigma: appConfig.sigma,
        });

        const featureJson = {
          forecasted_high: forecastedHigh,
          current_temp: currentTemp,
          forecast_timestamp: forecastTimestamp,
          previous_forecast_high: previousForecastHigh,
          forecast_revision: previousForecastHigh != null ? forecastedHigh - previousForecastHigh : null,
          sigma: appConfig.sigma,
          threshold: market.threshold_value,
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
          model_version: appConfig.modelVersion,
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
