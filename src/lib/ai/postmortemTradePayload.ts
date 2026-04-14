import type { PostmortemTradeData } from "@/lib/ai/postmortems";
import {
  getExternalDataSnapshotById,
  getModelOutputById,
  type Market,
  type Signal,
  type SimulatedTrade,
} from "@/lib/supabase/db";

/** Builds the JSON context stored on postmortems and sent to the LLM. */
export async function buildPostmortemTradePayload(args: {
  trade: SimulatedTrade;
  settledTrade: SimulatedTrade;
  market: Market;
  signal: Signal | null;
}): Promise<PostmortemTradeData> {
  const { trade, settledTrade, market, signal } = args;

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

  return {
    market_ticker: market.ticker,
    market_title: market.title,
    market_date: market.market_date,
    city_key: market.city_key,
    niche_key: market.niche_key,
    contract_style: contractStyle,
    side: trade.side,
    quantity: trade.quantity,
    entry_price: trade.entry_price,
    exit_price: settledTrade.exit_price,
    realized_pnl: settledTrade.realized_pnl,
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
