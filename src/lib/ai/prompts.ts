export const SIGNAL_EXPLANATION_PROMPT = `You are an analyst for a prediction market signal engine.

Given the following signal data, write a brief, clear explanation of:
1. The directional view (is YES or NO more likely, and why)
2. The economic worthiness (is the trade edge sufficient after costs and uncertainty)

Signal data:
{{signalData}}

Respond with valid JSON:
{
  "summary": "1-2 sentence explanation",
  "reasonCodes": ["code1", "code2", ...]
}

Use these reason codes when applicable:
- modeled_yes_above_market_price
- modeled_no_above_market_price
- trade_edge_yes_positive_after_buffers
- trade_edge_no_positive_after_buffers
- confidence_above_minimum
- high_probability_low_payout
- insufficient_trade_edge
- spread_too_wide
- too_close_to_settlement
- forecast_supports_direction
- large_forecast_threshold_gap`;

export const NO_TRADE_EXPLANATION_PROMPT = `You are an analyst for a prediction market signal engine.

Given the following market and model data, explain why NO_TRADE was selected.
Focus on: which economic conditions failed, not just the direction.

Data:
{{signalData}}

Respond with valid JSON:
{
  "summary": "1-2 sentence explanation of why no trade",
  "reasonCodes": ["code1", "code2", ...]
}`;

export const POSTMORTEM_PROMPT = `You are a trade postmortem analyst for a prediction market signal engine.

Analyze this settled trade and explain what happened.

Trade data (JSON) includes, when available:
- Execution: market, side, quantity, entry/exit prices, realized PnL.
- Signal at entry: signal_type, modeled probabilities, edges, confidence, signal_explanation, signal_entry_reason_codes.
- model_at_signal: the exact model run linked to this signal — modeled_probability_yes, model_confidence_score, feature_json (forecasted_high °F, sigma, threshold or bucket bounds, market_structure, yes/no bid-ask at run time, forecast revision vs previous run, climatology anomaly, lead time to local noon, current_temp).
- weather_snapshot_at_model: Open-Meteo snapshot used for that run — normalized_weather (forecast_date, timestamps, hourly_temps_count, utc offset, etc.).

Use forecasted_high vs the contract's threshold or bucket together with the actual market settlement (YES/NO) to judge whether forecast_was_accurate vs forecast_was_inaccurate is appropriate. Distinguish "forecast pointed the wrong way for this contract" from "forecast was plausible but the market price was wrong" when the data supports it.

Trade data:
{{tradeData}}

Market outcome: {{outcome}}
Model was {{correctness}} (the model predicted {{predictedSide}} and the outcome was {{actualOutcome}}).

Respond with valid JSON:
{
  "summary": "1-2 sentence postmortem",
  "reasonCodes": ["code1", "code2", ...]
}

Use these reason codes when applicable:
- model_correct_direction
- model_wrong_direction
- small_margin_vs_sigma
- model_overconfidence
- edge_too_thin
- forecast_was_accurate
- forecast_was_inaccurate
- unexpected_weather_shift
- expensive_no_leg_tail_loss (paid a high NO price; loss is large when YES settles)
- cheap_yes_leg_longshot_miss (paid a low YES price; many small losses, occasional big wins)`;
