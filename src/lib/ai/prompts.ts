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

Analyze this settled trade and explain what happened:

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
- unexpected_weather_shift`;
