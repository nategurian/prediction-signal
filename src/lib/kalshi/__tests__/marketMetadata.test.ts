import { describe, it, expect } from "vitest";
import { deriveMarketMetadataFromKalshi } from "../marketMetadata";
import type { KalshiMarket } from "../types";

function baseKm(over: Partial<KalshiMarket> & Record<string, unknown>): KalshiMarket {
  return {
    ticker: "KXHIGHNY-26APR06-B60.5",
    event_ticker: "KXHIGHNY-26APR06",
    title: "x",
    subtitle: "",
    status: "active",
    category: "weather",
    close_time: "",
    expiration_time: "",
    settlement_timer_seconds: 0,
    result: "",
    can_close_early: true,
    yes_sub_title: "",
    no_sub_title: "",
    ...over,
  } as KalshiMarket;
}

describe("deriveMarketMetadataFromKalshi", () => {
  it("uses strike_type between and floor/cap from API", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the high temp be 54-55°?",
        strike_type: "between",
        floor_strike: 54,
        cap_strike: 55,
      })
    );
    expect(m.market_structure).toBe("bucket_range");
    expect(m.bucket_lower).toBe(54);
    expect(m.bucket_upper).toBe(55);
    expect(m.threshold_value).toBeNull();
  });

  it("detects range in title without API strikes", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the **high temp in NYC** be 54-55° on Apr 6, 2026?",
      })
    );
    expect(m.market_structure).toBe("bucket_range");
    expect(m.bucket_lower).toBe(54);
    expect(m.bucket_upper).toBe(55);
  });

  it("detects > threshold in title", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the high temp be >67° on Apr 5, 2026?",
        ticker: "KXHIGHNY-26APR05-T67",
      })
    );
    expect(m.market_structure).toBe("binary_threshold");
    expect(m.threshold_value).toBe(67);
  });

  it("uses -T67 in ticker as fallback", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "obscure",
        ticker: "KXHIGHNY-26APR05-T67",
      })
    );
    expect(m.threshold_value).toBe(67);
  });
});
