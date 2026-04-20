export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getActiveMarkets,
  getLatestSnapshot,
  getRecentSignals,
  getLatestModelOutput,
  getLatestExternalData,
  getAllCityCalibrations,
  getTradesForMarket,
  type CityCalibration,
  type Signal,
  type ExternalDataSnapshot,
} from "@/lib/supabase/db";
import { computeTradeEdges, selectAction } from "@/lib/engine/signal";
import { computeModeledProbability } from "@/lib/engine/probability";
import { computeConfidenceScore } from "@/lib/engine/confidence";
import { resolveEffectiveSigma } from "@/lib/engine/calibration";
import { getCityConfig, getAllCityKeys, sharedConfig } from "@/lib/config";

export async function GET() {
  try {
    const markets = await getActiveMarkets();
    const signals = await getRecentSignals(200);

    const externalDataByCity = new Map<string, ExternalDataSnapshot>();
    for (const cityKey of getAllCityKeys()) {
      const data = await getLatestExternalData(sharedConfig.nicheKey, cityKey);
      if (data) externalDataByCity.set(cityKey, data);
    }

    const calibrations = await getAllCityCalibrations();
    const calibrationByCity = new Map<string, CityCalibration>();
    for (const c of calibrations) calibrationByCity.set(c.city_key, c);

    const signalsByMarket = new Map<string, Signal>();
    for (const s of signals) {
      if (!signalsByMarket.has(s.market_id)) {
        signalsByMarket.set(s.market_id, s);
      }
    }

    const opportunities = await Promise.all(
      markets.map(async (market) => {
        const snapshot = await getLatestSnapshot(market.id);
        const signal = signalsByMarket.get(market.id);

        if (signal) {
          return {
            market: {
              id: market.id,
              ticker: market.ticker,
              title: market.title,
              market_date: market.market_date,
              threshold_value: market.threshold_value,
              market_structure: market.market_structure,
              settlement_time: market.settlement_time,
              city_key: market.city_key,
            },
            yes_ask: snapshot?.yes_ask ?? null,
            no_ask: snapshot?.no_ask ?? null,
            yes_bid: snapshot?.yes_bid ?? null,
            no_bid: snapshot?.no_bid ?? null,
            modeled_yes_probability: signal.modeled_yes_probability,
            modeled_no_probability: signal.modeled_no_probability,
            trade_edge_yes: signal.trade_edge_yes,
            trade_edge_no: signal.trade_edge_no,
            confidence: signal.confidence_score,
            signal_type: signal.signal_type,
            worth_trading: signal.worth_trading,
            explanation: signal.explanation,
          };
        }

        const modelOutput = await getLatestModelOutput(market.id);
        const cityConfig = getCityConfig(market.city_key);
        const externalData = externalDataByCity.get(market.city_key);

        let modeledYesProb: number | null = null;
        let confidenceScore: number | null = null;
        let effectiveSigma: number | null = null;

        if (modelOutput) {
          modeledYesProb = modelOutput.modeled_probability;
          confidenceScore = modelOutput.confidence_score;
          const featureJson = (modelOutput.feature_json ?? {}) as Record<string, unknown>;
          if (typeof featureJson.sigma === "number") effectiveSigma = featureJson.sigma;
        } else if (externalData && snapshot) {
          const normalized = externalData.normalized_json as Record<string, unknown>;
          const forecastedHigh = normalized.forecasted_high as number;
          const forecastTimestamp = normalized.forecast_timestamp as string;
          const previousForecastHigh = normalized.previous_forecast_high as number | null;

          const ensembleAvailable = normalized.ensemble_available === true;
          const ensembleSigmaUsed = normalized.ensemble_sigma_used;

          const ensembleSigmaCandidate =
            ensembleAvailable &&
            typeof ensembleSigmaUsed === "number" &&
            Number.isFinite(ensembleSigmaUsed)
              ? ensembleSigmaUsed
              : null;

          const calibration = calibrationByCity.get(market.city_key) ?? null;
          const resolved = resolveEffectiveSigma({
            calibration,
            ensembleSigma: ensembleSigmaCandidate,
            staticSigma: cityConfig.sigma,
            minCalibrationSamples: cityConfig.minCalibrationSamples,
            sigmaFloor: cityConfig.sigmaFloor,
            sigmaCeiling: cityConfig.sigmaCeiling,
          });
          effectiveSigma = resolved.sigma;

          const canModel =
            market.market_structure === "binary_threshold"
              ? market.threshold_value != null && market.threshold_direction != null
              : market.bucket_lower != null && market.bucket_upper != null;
          if (
            canModel &&
            forecastedHigh != null &&
            !Number.isNaN(Number(forecastedHigh)) &&
            forecastTimestamp
          ) {
            try {
              const probResult = computeModeledProbability({
                forecastHigh: forecastedHigh,
                marketStructure: market.market_structure,
                threshold: market.threshold_value,
                thresholdDirection: market.threshold_direction,
                bucketLower: market.bucket_lower,
                bucketUpper: market.bucket_upper,
                sigma: effectiveSigma,
              });
              confidenceScore = computeConfidenceScore({
                forecastTimestamp,
                forecastHigh: forecastedHigh,
                threshold: market.threshold_value,
                previousForecastHigh,
                yesBid: snapshot.yes_bid,
                yesAsk: snapshot.yes_ask,
                sigma: effectiveSigma,
              }, sharedConfig.confidenceWeights);
              modeledYesProb = probResult.modeledYesProbability;
            } catch (err) {
              console.error(`GET /api/opportunities live model skip ${market.ticker}:`, err);
            }
          }
        }

        if (
          snapshot &&
          snapshot.yes_ask != null &&
          snapshot.no_ask != null &&
          modeledYesProb != null &&
          confidenceScore != null
        ) {
          const edges = computeTradeEdges(modeledYesProb, snapshot.yes_ask, snapshot.no_ask, cityConfig);
          const existingTrades = await getTradesForMarket(market.id);
          const bucketWidth =
            market.bucket_upper != null && market.bucket_lower != null
              ? market.bucket_upper - market.bucket_lower
              : null;

          const action = selectAction({
            tradeEdgeYes: edges.tradeEdgeYes,
            tradeEdgeNo: edges.tradeEdgeNo,
            confidenceScore,
            yesAsk: snapshot.yes_ask,
            yesBid: snapshot.yes_bid ?? 0,
            noAsk: snapshot.no_ask,
            noBid: snapshot.no_bid ?? 0,
            settlementTime: market.settlement_time,
            hasOpenTradeForMarket: existingTrades.length > 0,
            marketStructure: market.market_structure,
            modeledYesProbability: modeledYesProb,
            bucketWidth,
            effectiveSigma: effectiveSigma ?? null,
          }, cityConfig);
          const worthTrading = action !== "NO_TRADE";

          return {
            market: {
              id: market.id,
              ticker: market.ticker,
              title: market.title,
              market_date: market.market_date,
              threshold_value: market.threshold_value,
              market_structure: market.market_structure,
              settlement_time: market.settlement_time,
              city_key: market.city_key,
            },
            yes_ask: snapshot.yes_ask,
            no_ask: snapshot.no_ask,
            yes_bid: snapshot.yes_bid,
            no_bid: snapshot.no_bid,
            modeled_yes_probability: modeledYesProb,
            modeled_no_probability: 1 - modeledYesProb,
            trade_edge_yes: edges.tradeEdgeYes,
            trade_edge_no: edges.tradeEdgeNo,
            confidence: confidenceScore,
            signal_type: action,
            worth_trading: worthTrading,
            explanation: null,
          };
        }

        return {
          market: {
            id: market.id,
            ticker: market.ticker,
            title: market.title,
            market_date: market.market_date,
            threshold_value: market.threshold_value,
            market_structure: market.market_structure,
            settlement_time: market.settlement_time,
            city_key: market.city_key,
          },
          yes_ask: snapshot?.yes_ask ?? null,
          no_ask: snapshot?.no_ask ?? null,
          yes_bid: snapshot?.yes_bid ?? null,
          no_bid: snapshot?.no_bid ?? null,
          modeled_yes_probability: null,
          modeled_no_probability: null,
          trade_edge_yes: null,
          trade_edge_no: null,
          confidence: null,
          signal_type: null,
          worth_trading: false,
          explanation: null,
        };
      })
    );

    return NextResponse.json({ opportunities });
  } catch (err) {
    console.error("GET /api/opportunities error:", err);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}
