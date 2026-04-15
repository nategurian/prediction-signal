import { describe, it, expect } from "vitest";
import { computeTradeEdges, selectAction, type TradingConfig } from "../signal";

const defaultConfig: TradingConfig = {
  slippagePenalty: 0.01,
  feePenalty: 0.0,
  uncertaintyBuffer: 0.02,
  minTradeEdge: 0.05,
  minConfidenceScore: 0.6,
  maxSpread: 0.06,
  maxMinutesBeforeSettlementToEnter: 180,
  highEntryThreshold: 0.80,
  highEntryMinEdge: 0.10,
};

describe("computeTradeEdges", () => {
  it("computes effective entry and edge correctly", () => {
    const result = computeTradeEdges(0.7, 0.58, 0.38, defaultConfig);
    expect(result.effectiveYesEntry).toBeCloseTo(0.61, 2);
    expect(result.effectiveNoEntry).toBeCloseTo(0.41, 2);
    expect(result.tradeEdgeYes).toBeCloseTo(0.09, 2);
    expect(result.tradeEdgeNo).toBeCloseTo(-0.11, 2);
  });

  it("high probability thin edge", () => {
    const result = computeTradeEdges(0.99, 0.98, 0.03, defaultConfig);
    expect(result.effectiveYesEntry).toBeCloseTo(1.01, 2);
    expect(result.tradeEdgeYes).toBeLessThan(0);
  });
});

describe("selectAction — economic test cases from Section 23", () => {
  const baseParams = {
    yesAsk: 0,
    yesBid: 0,
    noAsk: 0,
    noBid: 0,
    settlementTime: null,
    hasOpenTradeForMarket: false,
  };

  it("Case A: modeled YES=0.99, YES ask=0.98 → NO_TRADE (edge too thin after buffers)", () => {
    const edges = computeTradeEdges(0.99, 0.98, 0.03, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.98,
      yesBid: 0.96,
      noAsk: 0.03,
      noBid: 0.01,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("Case B: modeled YES=0.70, YES ask=0.58 → BUY_YES (positive edge after buffers)", () => {
    const edges = computeTradeEdges(0.7, 0.58, 0.38, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.58,
      yesBid: 0.56,
      noAsk: 0.38,
      noBid: 0.36,
    }, defaultConfig);
    expect(action).toBe("BUY_YES");
  });

  it("Case C: modeled YES=0.10, NO ask=0.82 → NO_TRADE (high-entry guard requires 10% edge)", () => {
    const edges = computeTradeEdges(0.1, 0.88, 0.82, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.88,
      yesBid: 0.86,
      noAsk: 0.82,
      noBid: 0.80,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("Case D: both sides negative after costs → NO_TRADE", () => {
    const edges = computeTradeEdges(0.5, 0.52, 0.52, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.52,
      yesBid: 0.50,
      noAsk: 0.52,
      noBid: 0.50,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("duplicate open trade → NO_TRADE regardless of edge", () => {
    const edges = computeTradeEdges(0.7, 0.50, 0.40, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.9,
      yesAsk: 0.50,
      yesBid: 0.48,
      noAsk: 0.40,
      noBid: 0.38,
      hasOpenTradeForMarket: true,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("low confidence → NO_TRADE regardless of edge", () => {
    const edges = computeTradeEdges(0.7, 0.50, 0.40, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.3,
      yesAsk: 0.50,
      yesBid: 0.48,
      noAsk: 0.40,
      noBid: 0.38,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("wide spread → NO_TRADE", () => {
    const edges = computeTradeEdges(0.7, 0.50, 0.40, defaultConfig);
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.60,
      yesBid: 0.40,
      noAsk: 0.50,
      noBid: 0.30,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });
});

describe("selectAction — high-entry edge guard", () => {
  const baseParams = {
    settlementTime: null,
    hasOpenTradeForMarket: false,
  };

  it("NO at 85¢ with 7% edge → NO_TRADE (below highEntryMinEdge of 10%)", () => {
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.07,
      confidenceScore: 0.8,
      yesAsk: 0.88,
      yesBid: 0.86,
      noAsk: 0.85,
      noBid: 0.83,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO at 85¢ with 12% edge → BUY_NO (above highEntryMinEdge)", () => {
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.12,
      confidenceScore: 0.8,
      yesAsk: 0.88,
      yesBid: 0.86,
      noAsk: 0.85,
      noBid: 0.83,
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });

  it("YES at 82¢ with 7% edge → NO_TRADE (high entry applies to YES too)", () => {
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: 0.07,
      tradeEdgeNo: -0.10,
      confidenceScore: 0.8,
      yesAsk: 0.82,
      yesBid: 0.80,
      noAsk: 0.20,
      noBid: 0.18,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });

  it("NO at 50¢ with 7% edge → BUY_NO (normal minTradeEdge applies)", () => {
    const action = selectAction({
      ...baseParams,
      tradeEdgeYes: -0.10,
      tradeEdgeNo: 0.07,
      confidenceScore: 0.8,
      yesAsk: 0.48,
      yesBid: 0.46,
      noAsk: 0.50,
      noBid: 0.48,
    }, defaultConfig);
    expect(action).toBe("BUY_NO");
  });
});

describe("selectAction — settlement time cutoff", () => {
  it("too close to settlement → NO_TRADE", () => {
    const edges = computeTradeEdges(0.7, 0.50, 0.40, defaultConfig);
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const action = selectAction({
      tradeEdgeYes: edges.tradeEdgeYes,
      tradeEdgeNo: edges.tradeEdgeNo,
      confidenceScore: 0.8,
      yesAsk: 0.50,
      yesBid: 0.48,
      noAsk: 0.40,
      noBid: 0.38,
      settlementTime: inOneHour,
      hasOpenTradeForMarket: false,
    }, defaultConfig);
    expect(action).toBe("NO_TRADE");
  });
});
