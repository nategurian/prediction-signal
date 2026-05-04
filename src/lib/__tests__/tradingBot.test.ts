import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildSignalPayload,
  sendSignalToTradingBot,
  signWebhookBody,
} from "@/lib/notifications/tradingBot";
import type { Market, MarketSnapshot, Signal } from "@/lib/supabase/db";

const market: Market = {
  id: "m1",
  ticker: "KXHIGHNY-26MAY04-T67",
  title: "NYC high above 67",
  category: "weather",
  niche_key: "weather_daily_temp",
  city_key: "nyc",
  variable: "daily_high",
  market_structure: "binary_threshold",
  market_date: "2026-05-04",
  threshold_value: 67,
  threshold_direction: "greater",
  bucket_lower: null,
  bucket_upper: null,
  close_time: null,
  settlement_time: null,
  status: "active",
  raw_json: null,
  created_at: "2026-05-04T08:00:00Z",
  updated_at: "2026-05-04T08:00:00Z",
};

const snapshot: MarketSnapshot = {
  id: "ms1",
  market_id: "m1",
  captured_at: "2026-05-04T13:50:00Z",
  yes_bid: 0.43,
  yes_ask: 0.45,
  no_bid: 0.53,
  no_ask: 0.55,
  last_price: 0.45,
  implied_probability: 0.45,
  volume: 1000,
  raw_json: null,
};

const baseSignal: Signal = {
  id: "s1",
  market_id: "m1",
  model_output_id: "mo1",
  captured_at: "2026-05-04T13:52:00Z",
  signal_type: "BUY_YES",
  confidence_score: 0.85,
  explanation: "...",
  reason_codes_json: null,
  status: "active",
  modeled_yes_probability: 0.62,
  modeled_no_probability: 0.38,
  effective_yes_entry_price: 0.48,
  effective_no_entry_price: 0.58,
  trade_edge_yes: 0.14,
  trade_edge_no: -0.13,
  worth_trading: true,
  model_version: "weather_temp_v8",
};

describe("buildSignalPayload", () => {
  it("converts 0.0-1.0 prices to integer cents matching the bot's reader", () => {
    const payload = buildSignalPayload({ signal: baseSignal, snapshot, market });
    expect(payload).not.toBeNull();
    expect(payload!.yes_ask).toBe(45);
    expect(payload!.no_ask).toBe(55);
    expect(payload!.yes_bid).toBe(43);
    expect(payload!.no_bid).toBe(53);
  });

  it("defaults contracts to 1 when env var is unset (safe for $50-$100 bankroll)", () => {
    const prev = process.env.TRADING_BOT_CONTRACTS;
    delete process.env.TRADING_BOT_CONTRACTS;
    try {
      const payload = buildSignalPayload({ signal: baseSignal, snapshot, market });
      expect(payload!.contracts).toBe(1);
    } finally {
      if (prev !== undefined) process.env.TRADING_BOT_CONTRACTS = prev;
    }
  });

  it("respects an explicit contracts override", () => {
    const payload = buildSignalPayload({ signal: baseSignal, snapshot, market, contracts: 3 });
    expect(payload!.contracts).toBe(3);
  });

  it("clamps illegal cent prices into [1, 99]", () => {
    const wide = { ...snapshot, yes_ask: 0.0001, no_ask: 0.999, yes_bid: -0.05, no_bid: 1.5 };
    const payload = buildSignalPayload({ signal: baseSignal, snapshot: wide, market });
    expect(payload!.yes_ask).toBe(1);
    expect(payload!.no_ask).toBe(99);
    expect(payload!.yes_bid).toBe(1);
    expect(payload!.no_bid).toBe(99);
  });

  it("returns null for NO_TRADE signals (cron should never forward those)", () => {
    const skip = { ...baseSignal, signal_type: "NO_TRADE" as const };
    expect(buildSignalPayload({ signal: skip, snapshot, market })).toBeNull();
  });

  it("propagates the threshold + structure for the bot's logging", () => {
    const payload = buildSignalPayload({ signal: baseSignal, snapshot, market });
    expect(payload!.threshold_value).toBe(67);
    expect(payload!.market_structure).toBe("binary_threshold");
    expect(payload!.market_ticker).toBe("KXHIGHNY-26MAY04-T67");
  });
});

describe("signWebhookBody", () => {
  it("matches the Python hmac-sha256 hex digest the bot computes", () => {
    const secret = "test-secret-1234";
    const body = JSON.stringify({ hello: "world" });
    const ours = signWebhookBody(body, secret);
    const reference = createHmac("sha256", secret).update(body).digest("hex");
    expect(ours).toBe(reference);
  });
});

describe("sendSignalToTradingBot", () => {
  it("is a no-op when TRADING_BOT_WEBHOOK_URL is unset", async () => {
    const calls: unknown[] = [];
    const fakeFetch: typeof fetch = (...args) => {
      calls.push(args);
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
    const prev = process.env.TRADING_BOT_WEBHOOK_URL;
    delete process.env.TRADING_BOT_WEBHOOK_URL;
    try {
      const res = await sendSignalToTradingBot({
        signal: baseSignal,
        snapshot,
        market,
        fetchImpl: fakeFetch,
      });
      expect(res).toEqual({ ok: true, skipped: true });
      expect(calls).toHaveLength(0);
    } finally {
      if (prev !== undefined) process.env.TRADING_BOT_WEBHOOK_URL = prev;
    }
  });

  it("posts a signed JSON body and parses the bot's JSON response", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fakeFetch: typeof fetch = (url, init) => {
      captured.url = url as string;
      captured.init = init;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, order_id: "o123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    };
    const res = await sendSignalToTradingBot({
      signal: baseSignal,
      snapshot,
      market,
      webhookUrl: "https://bot.example.com/webhook",
      webhookSecret: "shh",
      fetchImpl: fakeFetch,
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.response).toEqual({ ok: true, order_id: "o123" });
    expect(captured.url).toBe("https://bot.example.com/webhook");
    const headers = captured.init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const body = captured.init!.body as string;
    expect(headers["X-Webhook-Signature"]).toBe(signWebhookBody(body, "shh"));
    const parsed = JSON.parse(body);
    expect(parsed.signal_id).toBe("s1");
    expect(parsed.yes_ask).toBe(45);
  });

  it("returns ok:false on HTTP errors without throwing", async () => {
    const fakeFetch: typeof fetch = () =>
      Promise.resolve(new Response("nope", { status: 503 }));
    const res = await sendSignalToTradingBot({
      signal: baseSignal,
      snapshot,
      market,
      webhookUrl: "https://bot.example.com/webhook",
      fetchImpl: fakeFetch,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("returns ok:false on network errors without throwing", async () => {
    const fakeFetch: typeof fetch = () => Promise.reject(new Error("ECONNREFUSED"));
    const res = await sendSignalToTradingBot({
      signal: baseSignal,
      snapshot,
      market,
      webhookUrl: "https://bot.example.com/webhook",
      fetchImpl: fakeFetch,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
  });
});
