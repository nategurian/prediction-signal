import type { PostmortemTradeData } from "@/lib/ai/postmortems";
import { appConfig } from "@/lib/config";
import {
  getExternalDataSnapshotById,
  getModelOutputById,
  type Market,
  type Signal,
  type SimulatedTrade,
} from "@/lib/supabase/db";

interface SanityFlags {
  polarity_mismatch: boolean;
  forecast_accurate: boolean | null;
  forecast_inaccurate: boolean | null;
  sigma_tail_event: boolean | null;
  max_loss_entry: boolean;
}

function computeSanityFlags(args: {
  forecastHigh: number | null;
  actualHigh: number | null;
  modeledYesProb: number | null;
  thresholdDirection: string | null;
  contractStyle: string;
  threshold: number | null;
  entryPrice: number;
  won: boolean;
  sigma: number;
}): SanityFlags {
  const {
    forecastHigh,
    actualHigh,
    modeledYesProb,
    thresholdDirection,
    contractStyle,
    threshold,
    entryPrice,
    won,
    sigma,
  } = args;

  let polarity_mismatch = false;
  if (
    contractStyle === "threshold" &&
    forecastHigh != null &&
    threshold != null &&
    modeledYesProb != null
  ) {
    if (thresholdDirection === "less") {
      polarity_mismatch = forecastHigh > threshold + sigma && modeledYesProb > 0.5;
    } else if (thresholdDirection === "greater") {
      polarity_mismatch = forecastHigh < threshold - sigma && modeledYesProb > 0.5;
    }
  }

  let forecast_accurate: boolean | null = null;
  let forecast_inaccurate: boolean | null = null;
  let sigma_tail_event: boolean | null = null;

  if (forecastHigh != null && actualHigh != null) {
    const delta = Math.abs(actualHigh - forecastHigh);
    forecast_accurate = delta <= sigma;
    forecast_inaccurate = delta > sigma;
    sigma_tail_event = delta > 2 * sigma;
  }

  const max_loss_entry = !won && entryPrice >= 0.8;

  return {
    polarity_mismatch,
    forecast_accurate,
    forecast_inaccurate,
    sigma_tail_event,
    max_loss_entry,
  };
}

/** Builds the JSON context stored on postmortems and sent to the LLM. */
export async function buildPostmortemTradePayload(args: {
  trade: SimulatedTrade;
  settledTrade: SimulatedTrade;
  market: Market;
  signal: Signal | null;
  actualHighTemp?: number | null;
}): Promise<PostmortemTradeData> {
  const { trade, settledTrade, market, signal, actualHighTemp } = args;

  const modelOutput = signal ? await getModelOutputById(signal.model_output_id) : null;
  const externalSnapshot =
    modelOutput?.external_data_id != null
      ? await getExternalDataSnapshotById(modelOutput.external_data_id)
      : null;

  const contractStyle = market.ticker.includes("-B")
    ? "bucket"
    : market.ticker.includes("-T")
      ? "threshold"
      : "unknown";

  const forecastHigh =
    (modelOutput?.feature_json as Record<string, unknown> | null)?.forecasted_high as
      | number
      | undefined ?? null;

  const won =
    (trade.side === "YES" && settledTrade.exit_price === 1) ||
    (trade.side === "NO" && settledTrade.exit_price === 1);

  const sanityFlags = computeSanityFlags({
    forecastHigh,
    actualHigh: actualHighTemp ?? null,
    modeledYesProb: signal?.modeled_yes_probability ?? null,
    thresholdDirection: market.threshold_direction,
    contractStyle,
    threshold: market.threshold_value,
    entryPrice: trade.entry_price,
    won,
    sigma: appConfig.sigma,
  });

  return {
    market_ticker: market.ticker,
    market_title: market.title,
    market_date: market.market_date,
    city_key: market.city_key,
    niche_key: market.niche_key,
    contract_style: contractStyle,
    threshold_direction: market.threshold_direction,
    side: trade.side,
    quantity: trade.quantity,
    entry_price: trade.entry_price,
    exit_price: settledTrade.exit_price,
    realized_pnl: settledTrade.realized_pnl,
    actual_high_temp: actualHighTemp ?? null,
    signal_type: signal?.signal_type ?? null,
    confidence_score: signal?.confidence_score ?? null,
    modeled_yes_probability: signal?.modeled_yes_probability ?? null,
    modeled_no_probability: signal?.modeled_no_probability ?? null,
    trade_edge_yes: signal?.trade_edge_yes ?? null,
    trade_edge_no: signal?.trade_edge_no ?? null,
    model_version: signal?.model_version ?? null,
    signal_captured_at: signal?.captured_at ?? null,
    signal_explanation: signal?.explanation ?? null,
    signal_entry_reason_codes: signal?.reason_codes_json ?? null,
    sanity_flags: sanityFlags,
    model_at_signal: modelOutput
      ? {
          captured_at: modelOutput.captured_at,
          modeled_probability_yes: modelOutput.modeled_probability,
          model_confidence_score: modelOutput.confidence_score,
          model_version: modelOutput.model_version,
          feature_json: modelOutput.feature_json,
        }
      : null,
    weather_snapshot_at_model: externalSnapshot
      ? {
          captured_at: externalSnapshot.captured_at,
          source_name: externalSnapshot.source_name,
          niche_key: externalSnapshot.niche_key,
          city_key: externalSnapshot.city_key,
          normalized_weather: externalSnapshot.normalized_json,
        }
      : null,
  };
}
