import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/lib/supabase/db"
  );
  return {
    ...actual,
    getModelOutputById: vi.fn(),
    getExternalDataSnapshotById: vi.fn(),
  };
});

import { buildPostmortemTradePayload } from "@/lib/ai/postmortemTradePayload";
import {
  getModelOutputById,
  getExternalDataSnapshotById,
  type Market,
  type Signal,
  type SimulatedTrade,
  type ModelOutput,
} from "@/lib/supabase/db";

const baseMarket: Market = {
  id: "m1",
  ticker: "KXHIGHNY-26APR29-T67",
  title: "NYC high above 67",
  category: "weather",
  niche_key: "weather_daily_temp",
  city_key: "nyc",
  variable: "daily_high",
  market_structure: "binary_threshold",
  market_date: "2026-04-29",
  threshold_value: 67,
  threshold_direction: "greater",
  bucket_lower: null,
  bucket_upper: null,
  close_time: null,
  settlement_time: null,
  status: "settled",
  raw_json: null,
  created_at: "2026-04-29T00:00:00Z",
  updated_at: "2026-04-29T00:00:00Z",
};

const baseTrade: SimulatedTrade = {
  id: "t1",
  account_id: "default",
  market_id: "m1",
  signal_id: "s1",
  side: "YES",
  quantity: 10,
  entry_time: "2026-04-29T08:00:00Z",
  entry_price: 0.55,
  current_mark_price: null,
  exit_time: null,
  exit_price: null,
  status: "open",
  unrealized_pnl: 0,
  realized_pnl: null,
  notes: null,
};

const settledTrade: SimulatedTrade = {
  ...baseTrade,
  exit_time: "2026-04-29T20:00:00Z",
  exit_price: 1,
  realized_pnl: 4.5,
  status: "settled",
};

const baseSignal: Signal = {
  id: "s1",
  market_id: "m1",
  model_output_id: "mo1",
  captured_at: "2026-04-29T08:00:00Z",
  signal_type: "BUY_YES",
  confidence_score: 0.85,
  explanation: null,
  reason_codes_json: null,
  status: "active",
  modeled_yes_probability: 0.72,
  modeled_no_probability: 0.28,
  effective_yes_entry_price: 0.55,
  effective_no_entry_price: 0.45,
  trade_edge_yes: 0.17,
  trade_edge_no: -0.17,
  worth_trading: true,
  model_version: "weather_temp_v8",
};

const baseModelOutput: ModelOutput = {
  id: "mo1",
  market_id: "m1",
  captured_at: "2026-04-29T08:00:00Z",
  modeled_probability: 0.72,
  confidence_score: 0.85,
  feature_json: {
    variable: "daily_high",
    forecasted_value: 70,
    forecasted_high: 70,
    forecast_target_date: "2026-04-29",
    sigma: 3.5,
  },
  model_version: "weather_temp_v8",
  external_data_id: null,
};

describe("buildPostmortemTradePayload — variable-aware dual-write", () => {
  beforeEach(() => {
    vi.mocked(getModelOutputById).mockResolvedValue(baseModelOutput);
    vi.mocked(getExternalDataSnapshotById).mockResolvedValue(null);
  });

  it("writes variable + variable-neutral fields alongside legacy actual_high_temp", async () => {
    const result = await buildPostmortemTradePayload({
      trade: baseTrade,
      settledTrade,
      market: baseMarket,
      signal: baseSignal,
      actualHighTemp: 72,
    });

    expect(result.variable).toBe("daily_high");
    expect(result.actual_value).toBe(72);
    expect(result.forecasted_value).toBe(70);
    expect(result.actual_high_temp).toBe(72);
    expect(result.city_key).toBe("nyc");
  });

  it("preserves legacy actual_high_temp = actual_value", async () => {
    const result = await buildPostmortemTradePayload({
      trade: baseTrade,
      settledTrade,
      market: baseMarket,
      signal: baseSignal,
      actualHighTemp: 65,
    });

    expect(result.actual_value).toBe(65);
    expect(result.actual_high_temp).toBe(65);
  });

  it("falls back to feature_json.forecasted_high when forecasted_value is absent (pre-Phase-2a model output)", async () => {
    const legacyModelOutput: ModelOutput = {
      ...baseModelOutput,
      feature_json: {
        forecasted_high: 68,
        forecast_target_date: "2026-04-29",
        sigma: 3.5,
      },
    };
    vi.mocked(getModelOutputById).mockResolvedValue(legacyModelOutput);

    const result = await buildPostmortemTradePayload({
      trade: baseTrade,
      settledTrade,
      market: baseMarket,
      signal: baseSignal,
      actualHighTemp: 70,
    });

    expect(result.forecasted_value).toBe(68);
  });

  it("handles null actualHighTemp gracefully", async () => {
    const result = await buildPostmortemTradePayload({
      trade: baseTrade,
      settledTrade,
      market: baseMarket,
      signal: baseSignal,
      actualHighTemp: null,
    });

    expect(result.actual_value).toBeNull();
    expect(result.actual_high_temp).toBeNull();
  });
});
