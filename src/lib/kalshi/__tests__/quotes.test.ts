import { describe, it, expect } from "vitest";
import { kalshiMarketToQuotePrices, kalshiVolume } from "../quotes";
import type { KalshiMarket } from "../types";

describe("kalshiMarketToQuotePrices", () => {
  it("uses *_dollars string fields (Trade API v2)", () => {
    const km = {
      ticker: "KXHIGHNY-26APR06-B60.5",
      title: "test",
      subtitle: "",
      status: "active",
      yes_ask_dollars: "0.0000",
      yes_bid_dollars: "0.0000",
      no_ask_dollars: "1.0000",
      no_bid_dollars: "1.0000",
      last_price_dollars: "0.0000",
      event_ticker: "E",
      category: "weather",
      close_time: "",
      expiration_time: "",
      settlement_timer_seconds: 0,
      result: "",
      can_close_early: true,
      yes_sub_title: "",
      no_sub_title: "",
    } as KalshiMarket;

    const q = kalshiMarketToQuotePrices(km);
    expect(q.yes_ask).toBe(0);
    expect(q.yes_bid).toBe(0);
    expect(q.no_ask).toBe(1);
    expect(q.no_bid).toBe(1);
    expect(q.last_price).toBe(0);
  });

  it("falls back to cent fields when dollars absent", () => {
    const km = {
      ticker: "T",
      title: "t",
      subtitle: "",
      status: "active",
      yes_bid: 45,
      yes_ask: 55,
      no_bid: 45,
      no_ask: 55,
      last_price: 50,
      event_ticker: "E",
      category: "c",
      close_time: "",
      expiration_time: "",
      settlement_timer_seconds: 0,
      result: "",
      can_close_early: false,
      yes_sub_title: "",
      no_sub_title: "",
    } as KalshiMarket;

    const q = kalshiMarketToQuotePrices(km);
    expect(q.yes_bid).toBe(0.45);
    expect(q.yes_ask).toBe(0.55);
  });
});

describe("kalshiVolume", () => {
  it("reads volume_fp when volume missing", () => {
    const km = { volume_fp: "123.45" } as KalshiMarket;
    expect(kalshiVolume(km)).toBe(123);
  });
});
