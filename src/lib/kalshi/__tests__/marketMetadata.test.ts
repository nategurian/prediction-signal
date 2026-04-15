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
    expect(m.threshold_direction).toBeNull();
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
    expect(m.threshold_direction).toBeNull();
  });

  it("detects > threshold in title → direction 'greater'", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the high temp be >67° on Apr 5, 2026?",
        ticker: "KXHIGHNY-26APR05-T67",
      })
    );
    expect(m.market_structure).toBe("binary_threshold");
    expect(m.threshold_value).toBe(67);
    expect(m.threshold_direction).toBe("greater");
  });

  it("detects < threshold in title → direction 'less'", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the **high temp in NYC** be <83° on Apr 15, 2026?",
        ticker: "KXHIGHNY-26APR15-T83",
        strike_type: "less",
      })
    );
    expect(m.market_structure).toBe("binary_threshold");
    expect(m.threshold_value).toBe(83);
    expect(m.threshold_direction).toBe("less");
  });

  it("uses strike_type 'greater' from API", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Will the **high temp in NYC** be >90° on Apr 15, 2026?",
        ticker: "KXHIGHNY-26APR15-T90",
        strike_type: "greater",
      })
    );
    expect(m.threshold_direction).toBe("greater");
    expect(m.threshold_value).toBe(90);
  });

  it("uses strike_type 'less' from API even with generic title", () => {
    const m = deriveMarketMetadataFromKalshi(
      baseKm({
        title: "Some generic 60°F market",
        strike_type: "less",
      })
    );
    expect(m.threshold_direction).toBe("less");
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
