import { describe, it, expect } from "vitest";
import { computeTradeEdges, selectAction, type TradingConfig } from "../signal";

const defaultConfig: TradingConfig = {
  slippagePenalty: 0.01,
  uncertaintyBuffer: 0.02,
  minTradeEdge: 0.08,
  minConfidenceScore: 0.8,
  maxSpread: 0.06,
  maxMinutesBeforeSettlementToEnter: 180,
  highEntryThreshold: 0.75,
  highEntryMinEdge: 0.10,
  maxNoEntryPrice: 0.75,
  maxYesModeledProbability: 0.50,
  disableBucketRangeYes: true,
  disabledMarketStructures: [],
  minBucketWidthSigmaRatio: 1.5,
};

const baseSelectionParams = {
  yesAsk: 0,
  yesBid: 0,
  noAsk: 0,
  noBid: 0,
  settlementTime: null,
  hasOpenTradeForMarket: false,
  marketStructure: "binary_threshold" as const,
  modeledYesProbability: 0.2,
};

describe("computeTradeEdges", () => {
  it("computes effective entry and edge correctly", () => {
    // At yesAsk=0.58 the expected per-contract fee is 0.07×0.58×0.42 ≈ 1.7¢,
    // so effectiveYesEntry ≈ 0.58 + 0.01 (slip) + 0.017 (fee) + 0.02 (unc) ≈ 0.627.
    const result = computeTradeEdges(0.7, 0.58, 0.38, defaultConfig);
    expect(result.effectiveYesEntry).toBeCloseTo(0.63, 2);
    expect(result.effectiveNoEntry).toBeCloseTo(0.43, 2);
    expect(result.tradeEdgeYes).toBeCloseTo(0.07, 2);
    expect(result.tradeEdgeNo).toBeCloseTo(-0.13, 2);
  });

  it("high probability thin edge", () => {
    const result = computeTradeEdges(0.99, 0.98, 0.03, defaultConfig);
    expect(result.effectiveYesEntry).toBeCloseTo(1.01, 2);
    expect(result.tradeEdgeYes).toBeLessThan(0);
  });
});

describe("selectAction — economic gates", () => {
  it("edge too thin after buffers → NO_TRADE", () => {
    const edges = computeTradeEdges(0.99, 0.98, 0.03, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.98,
      yesBid: 0.96,
      noAsk: 0.03,
      noBid: 0.01,
      modeledYesProbability: 0.99,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("cheap YES longshot with positive edge → BUY_YES (modeled pYes below cap)", () => {
    // Cheap YES longshot: market prices YES at 0.10; model says 0.22; edge = 0.09 > 0.08 minTradeEdge
    const edges = computeTradeEdges(0.22, 0.10, 0.90, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.10,
      yesBid: 0.08,
      noAsk: 0.90,
      noBid: 0.88,
      modeledYesProbability: 0.22,
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });

  it("both sides negative after costs → NO_TRADE", () => {
    const edges = computeTradeEdges(0.5, 0.52, 0.52, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.52,
      yesBid: 0.50,
      noAsk: 0.52,
      noBid: 0.50,
      modeledYesProbability: 0.5,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("duplicate open trade → NO_TRADE regardless of edge", () => {
    const edges = computeTradeEdges(0.22, 0.10, 0.90, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.9,
      yesAsk: 0.10,
      yesBid: 0.08,
      noAsk: 0.90,
      noBid: 0.88,
      hasOpenTradeForMarket: true,
      modeledYesProbability: 0.22,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("confidence below threshold → NO_TRADE", () => {
    const edges = computeTradeEdges(0.22, 0.10, 0.90, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.75,
      yesAsk: 0.10,
      yesBid: 0.08,
      noAsk: 0.90,
      noBid: 0.88,
      modeledYesProbability: 0.22,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("wide spread on both sides → NO_TRADE", () => {
    const edges = computeTradeEdges(0.7, 0.50, 0.40, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.60,
      yesBid: 0.40,
      noAsk: 0.50,
      noBid: 0.30,
      modeledYesProbability: 0.7,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });
});

describe("selectAction — high-entry edge guard", () => {
  it("NO at 0.76 with 7% edge → NO_TRADE (high-entry requires 10%)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.07,
      confidenceScore: 0.85,
      yesAsk: 0.22,
      yesBid: 0.20,
      noAsk: 0.76,
      noBid: 0.74,
      modeledYesProbability: 0.15,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO at 0.76 with 12% edge → BUY_NO (above highEntryMinEdge and below maxNoEntryPrice? NO — 0.76>0.75 caps it)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.12,
      confidenceScore: 0.85,
      yesAsk: 0.22,
      yesBid: 0.20,
      noAsk: 0.76,
      noBid: 0.74,
      modeledYesProbability: 0.12,
    }, defaultConfig);
    // 0.76 exceeds new maxNoEntryPrice of 0.75 → cap binds
    expect(action).toBe("NO_TRADE");
  });

  it("NO at exactly 0.75 with 11% edge → BUY_NO (at cap, high-entry edge satisfied)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.11,
      confidenceScore: 0.85,
      yesAsk: 0.23,
      yesBid: 0.21,
      noAsk: 0.75,
      noBid: 0.73,
      modeledYesProbability: 0.14,
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });

  it("NO at 0.50 with 7% edge → NO_TRADE (below minTradeEdge of 0.08)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.07,
      confidenceScore: 0.85,
      yesAsk: 0.48,
      yesBid: 0.46,
      noAsk: 0.50,
      noBid: 0.48,
      modeledYesProbability: 0.43,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO at 0.50 with 9% edge → BUY_NO (above minTradeEdge)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.09,
      confidenceScore: 0.85,
      yesAsk: 0.48,
      yesBid: 0.46,
      noAsk: 0.50,
      noBid: 0.48,
      modeledYesProbability: 0.41,
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });
});

describe("selectAction — maxNoEntryPrice cap", () => {
  it("NO at 0.80 even with 15% edge → NO_TRADE (exceeds 0.75 cap)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.20,
      tradeEdgeNo: 0.15,
      confidenceScore: 0.90,
      yesAsk: 0.18,
      yesBid: 0.16,
      noAsk: 0.80,
      noBid: 0.78,
      modeledYesProbability: 0.05,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO too expensive but YES qualifies → BUY_YES (YES still considered)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: 0.10,
      tradeEdgeNo: 0.15,
      confidenceScore: 0.85,
      yesAsk: 0.12,
      yesBid: 0.10,
      noAsk: 0.88,
      noBid: 0.86,
      modeledYesProbability: 0.25,
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });
});

describe("selectAction — settlement time cutoff", () => {
  it("too close to settlement → NO_TRADE", () => {
    const edges = computeTradeEdges(0.22, 0.10, 0.90, defaultConfig);
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.10,
      yesBid: 0.08,
      noAsk: 0.90,
      noBid: 0.88,
      settlementTime: inOneHour,
      modeledYesProbability: 0.22,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });
});

describe("selectAction — bucket_range YES structural block", () => {
  const cheapYesEdge = {
    tradeEdgeYes: 0.12,
    tradeEdgeNo: -0.20,
    confidenceScore: 0.85,
    yesAsk: 0.08,
    yesBid: 0.06,
    noAsk: 0.92,
    noBid: 0.90,
    modeledYesProbability: 0.20,
  };

  it("bucket_range YES is blocked when disableBucketRangeYes=true", () => {
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesEdge,
      marketStructure: "bucket_range",
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("binary_threshold YES is NOT blocked by disableBucketRangeYes", () => {
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesEdge,
      marketStructure: "binary_threshold",
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });

  it("bucket_range YES is allowed when disableBucketRangeYes=false", () => {
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesEdge,
      marketStructure: "bucket_range",
    }, { ...defaultConfig, disableBucketRangeYes: false });
    expect(action).toBe("BUY_YES");
  });

  it("bucket_range NO leg is still allowed when only YES is disabled", () => {
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: -0.20,
      tradeEdgeNo: 0.11,
      confidenceScore: 0.85,
      yesAsk: 0.26,
      yesBid: 0.24,
      noAsk: 0.74,
      noBid: 0.72,
      modeledYesProbability: 0.13,
      marketStructure: "bucket_range",
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });
});

describe("selectAction — maxYesModeledProbability guard", () => {
  it("YES blocked when modeled pYes >= 0.5 even with positive edge", () => {
    // Market prices YES at 0.50; model says 0.65; edge = 0.12 > minTradeEdge
    const edges = computeTradeEdges(0.65, 0.50, 0.50, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.50,
      yesBid: 0.48,
      noAsk: 0.50,
      noBid: 0.48,
      modeledYesProbability: 0.65,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("YES allowed when modeled pYes below cap", () => {
    const edges = computeTradeEdges(0.30, 0.15, 0.85, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.15,
      yesBid: 0.13,
      noAsk: 0.85,
      noBid: 0.83,
      modeledYesProbability: 0.30,
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });

  it("YES at exactly maxYesModeledProbability is blocked (>= is strict)", () => {
    const edges = computeTradeEdges(0.50, 0.35, 0.65, defaultConfig);
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.85,
      yesAsk: 0.35,
      yesBid: 0.33,
      noAsk: 0.65,
      noBid: 0.63,
      modeledYesProbability: 0.50,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO leg still considered when YES is blocked by pYes cap", () => {
    // Model says pYes=0.60 (YES blocked), but NO is cheap and has edge
    const action = selectAction({
      ...baseSelectionParams,
      tradeEdgeYes: 0.10,
      tradeEdgeNo: 0.10,
      confidenceScore: 0.85,
      yesAsk: 0.50,
      yesBid: 0.48,
      noAsk: 0.50,
      noBid: 0.48,
      modeledYesProbability: 0.60,
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });
});

describe("selectAction — disabledMarketStructures (per-city)", () => {
  const cheapYesBucket = {
    tradeEdgeYes: 0.12,
    tradeEdgeNo: 0.12,
    confidenceScore: 0.85,
    yesAsk: 0.08,
    yesBid: 0.06,
    noAsk: 0.72,
    noBid: 0.70,
    modeledYesProbability: 0.20,
    marketStructure: "bucket_range" as const,
  };

  it("bucket_range disabled → NO_TRADE on both sides", () => {
    const miamiConfig: TradingConfig = {
      ...defaultConfig,
      disabledMarketStructures: ["bucket_range"],
    };
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesBucket,
    }, miamiConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("binary_threshold allowed when only bucket_range is disabled", () => {
    const miamiConfig: TradingConfig = {
      ...defaultConfig,
      disabledMarketStructures: ["bucket_range"],
    };
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesBucket,
      marketStructure: "binary_threshold",
    }, miamiConfig);
    expect(action).toBe("BUY_YES");
  });

  it("empty disabledMarketStructures permits all structures (subject to other gates)", () => {
    const action = selectAction({
      ...baseSelectionParams,
      ...cheapYesBucket,
      marketStructure: "binary_threshold",
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });
});

describe("selectAction — bucket width / σ ratio gate", () => {
  const bucketWide = {
    tradeEdgeYes: -0.20,
    tradeEdgeNo: 0.12,
    confidenceScore: 0.85,
    yesAsk: 0.25,
    yesBid: 0.23,
    noAsk: 0.73,
    noBid: 0.71,
    modeledYesProbability: 0.10,
    marketStructure: "bucket_range" as const,
  };

  it("1°F bucket against σ=3.5 → ratio 0.29 < 1.5 → NO_TRADE (both sides)", () => {
    const action = selectAction(
      {
        ...baseSelectionParams,
        ...bucketWide,
        bucketWidth: 1,
        effectiveSigma: 3.5,
      },
      { ...defaultConfig, disableBucketRangeYes: false }
    );
    expect(action).toBe("NO_TRADE");
  });

  it("6°F bucket against σ=3.5 → ratio 1.71 > 1.5 → trade passes", () => {
    const action = selectAction(
      {
        ...baseSelectionParams,
        ...bucketWide,
        bucketWidth: 6,
        effectiveSigma: 3.5,
      },
      { ...defaultConfig, disableBucketRangeYes: false }
    );
    expect(action).toBe("BUY_NO");
  });

  it("gate is disabled when minBucketWidthSigmaRatio = 0", () => {
    const action = selectAction(
      {
        ...baseSelectionParams,
        ...bucketWide,
        bucketWidth: 1,
        effectiveSigma: 3.5,
      },
      { ...defaultConfig, minBucketWidthSigmaRatio: 0, disableBucketRangeYes: false }
    );
    expect(action).toBe("BUY_NO");
  });

  it("missing bucketWidth or effectiveSigma does not trigger the gate", () => {
    const action = selectAction(
      {
        ...baseSelectionParams,
        ...bucketWide,
      },
      { ...defaultConfig, disableBucketRangeYes: false }
    );
    expect(action).toBe("BUY_NO");
  });

  it("gate does not apply to binary_threshold markets", () => {
    const action = selectAction(
      {
        ...baseSelectionParams,
        ...bucketWide,
        marketStructure: "binary_threshold",
        bucketWidth: 1,
        effectiveSigma: 3.5,
      },
      defaultConfig
    );
    expect(action).toBe("BUY_NO");
  });
});
